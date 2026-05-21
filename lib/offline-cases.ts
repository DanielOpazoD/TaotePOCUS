// Client-side glue for the selective-offline media feature
// (see `app/sw.ts` for the SW side of the protocol).
//
// Two storage layers, kept in sync:
//
//   - **localStorage** (`pocus.offlineCaseIds`): cheap to read at
//     boot, lets cards / modal compute "this case is saved" before
//     the SW responds. Stores the set of case IDs (NOT the URLs)
//     so we can resolve `caseId -> media URL` even if the corpus
//     changes (admin re-uploads media, etc).
//   - **Service Worker cache** (`pocus-offline-media`): the actual
//     bytes. Source of truth for what's truly available offline.
//
// On boot the hook hydrates localStorage from the SW (asking
// `offline:list`) so a manual cache wipe (Settings → Clear site
// data) or LRU eviction during a closed-tab session don't leave
// stale IDs lingering.
//
// Why not just postMessage every read? Because the SW reply is
// async and would force every render to defer until the message
// round-trips. localStorage is sync and lets the UI render the
// "saved" badge on first paint.

const STORAGE_KEY = "pocus.offlineCaseIds";

/** Reply shapes posted back by the SW. Keep in sync with
 *  `app/sw.ts` message handlers. */
type ReplyMessage =
  | { type: "offline:added"; url: string; evicted: string[] }
  | { type: "offline:removed"; url: string }
  | { type: "offline:list-result"; urls: string[] }
  | { type: "offline:purged" }
  | { type: "offline:error"; url: string; message: string };

/** Read the local set of case IDs. Defensive against malformed
 *  localStorage payloads (older format, manual edit). */
export function readSavedCaseIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

/** Persist the updated set. No-op SSR. */
export function writeSavedCaseIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Quota or private-mode lockout — fail silently. The SW cache
    // is still the truth; we just lose the fast-read optimization.
  }
}

/** Send a message to the active SW with a MessageChannel-based
 *  reply path so we can `await` the response. Returns null when no
 *  SW is registered yet (first visit before registration finishes,
 *  or environments where SW is disabled — dev with HMR, tests). */
export function postToSW(message: object, timeoutMs = 30_000): Promise<ReplyMessage | null> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) {
    return Promise.resolve(null);
  }
  const controller = navigator.serviceWorker.controller;
  if (!controller) return Promise.resolve(null);
  return new Promise<ReplyMessage | null>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      resolve(null);
    }, timeoutMs);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data as ReplyMessage);
    };
    controller.postMessage(message, [channel.port2]);
  });
}

/** Save a case's media for offline. Returns `{ ok, evictedCount }`
 *  so the caller can toast about LRU evictions. */
export async function saveCaseOffline(
  caseId: string,
  mediaUrl: string,
): Promise<{ ok: boolean; evictedCount: number; error?: string }> {
  const reply = await postToSW({ type: "offline:add", url: mediaUrl });
  if (!reply) return { ok: false, evictedCount: 0, error: "no-controller" };
  if (reply.type === "offline:error") {
    return { ok: false, evictedCount: 0, error: reply.message };
  }
  if (reply.type !== "offline:added") {
    return { ok: false, evictedCount: 0, error: "unexpected-reply" };
  }
  // Reconcile localStorage AFTER the SW confirms — avoids the
  // optimistic-write surface where we say "saved" but the SW
  // failed silently.
  const ids = readSavedCaseIds();
  ids.add(caseId);
  // Any URLs the SW evicted to make room for this one map back to
  // case IDs via the reverse lookup the caller provides — but we
  // don't have that mapping here. The caller (the hook) holds the
  // URL→id table and can drop the evicted IDs from `ids`.
  writeSavedCaseIds(ids);
  return { ok: true, evictedCount: reply.evicted.length };
}

/** Remove a case's media from the offline cache. Idempotent — no
 *  error if the case wasn't saved to begin with. */
export async function removeCaseOffline(
  caseId: string,
  mediaUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const reply = await postToSW({ type: "offline:remove", url: mediaUrl });
  if (!reply) return { ok: false, error: "no-controller" };
  if (reply.type === "offline:error") return { ok: false, error: reply.message };
  const ids = readSavedCaseIds();
  ids.delete(caseId);
  writeSavedCaseIds(ids);
  return { ok: true };
}

/** Ask the SW which URLs are currently cached. Used at boot to
 *  reconcile localStorage with the real cache state. */
export async function listOfflineUrls(): Promise<string[] | null> {
  const reply = await postToSW({ type: "offline:list" });
  if (!reply) return null;
  if (reply.type !== "offline:list-result") return null;
  return reply.urls;
}

/** Nuke the entire offline cache. Used by the settings panel
 *  "Liberar todo el espacio" affordance. */
export async function purgeAllOffline(): Promise<boolean> {
  const reply = await postToSW({ type: "offline:purge-all" });
  if (!reply) return false;
  if (reply.type !== "offline:purged") return false;
  writeSavedCaseIds(new Set());
  return true;
}

/** Read the browser's overall storage budget. Useful for the
 *  settings panel "Estás usando X de Y" indicator. Returns null
 *  on browsers without the API (older Safari). */
export async function readStorageEstimate(): Promise<{
  usage: number;
  quota: number;
} | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    if (typeof est.usage !== "number" || typeof est.quota !== "number") return null;
    return { usage: est.usage, quota: est.quota };
  } catch {
    return null;
  }
}
