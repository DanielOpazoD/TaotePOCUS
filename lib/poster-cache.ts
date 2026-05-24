/**
 * IndexedDB-backed cache for video first-frame posters.
 *
 * Why this exists
 * ───────────────
 * The catalog renders ~330 case cards, each with a short cine-loop
 * video. Setting `preload="metadata"` paints the first frame on
 * desktop Chrome / Firefox, but **iOS Safari only loads the metadata
 * box** and shows a black square until the video is actually played
 * — which is the entire reason a user opens a card on a phone, the
 * "what's on the loop?" preview being our key affordance.
 *
 * Tier 1 of the poster strategy is therefore client-side: as soon as
 * a video element fires `loadedmetadata` (and again on `loadeddata`
 * as a fallback for engines that decode lazily), we draw the current
 * frame onto a canvas at 320 px max dimension, convert to a JPEG data
 * URL at quality 0.6 (~5–8 KB per case), and stash it here. On the
 * next visit the data URL is applied as the `<video poster>` so the
 * frame is visible BEFORE the network even gets the request out.
 *
 * Why IndexedDB and not localStorage
 * ──────────────────────────────────
 * localStorage caps at ~5 MB across the entire origin and runs on the
 * main thread synchronously. 330 cases × 6 KB ≈ 2 MB already eats
 * half the budget and competes with our other localStorage uses
 * (saved views, favorites). IDB is async, has a per-origin budget in
 * the hundreds of MB on every supported browser, and won't jank the
 * main thread during writes. Schema is a single store keyed by media
 * URL — no indices, no migrations.
 *
 * Entries get a `capturedAt` timestamp and we evict on read past 30
 * days. The MAX_AGE is conservative because frames are basically
 * immutable per case (we'd rotate the URL hash if the media changed)
 * — the TTL exists only to bound storage growth if cases are deleted
 * server-side.
 *
 * Bail-outs
 * ─────────
 * Every public function is wrapped in try/catch and resolves to a
 * "no cache" outcome (`null` on read, no-op on write) when IDB is
 * unavailable (private browsing in older Safari, quota errors, SSR).
 * The cache is purely an optimization — the video still works
 * without it.
 */

const DB_NAME = "pocus_v1";
const STORE = "video_posters";
const VERSION = 1;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface PosterEntry {
  url: string;
  dataUrl: string;
  capturedAt: number;
}

/** Resolve an open IDB connection, creating the object store on
 *  first run. Returns `null` if IDB isn't reachable so callers can
 *  short-circuit silently. */
function openDb(): Promise<IDBDatabase | null> {
  // SSR / non-browser guard. `globalThis.indexedDB` is the most
  // reliable check that works in both SSR and Web Worker contexts.
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, VERSION);
    } catch {
      // Older Safari in private mode throws synchronously here.
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "url" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    // `onblocked` fires when an older version is still open in
    // another tab. We just give up — the cache is best-effort and
    // the next page load will succeed.
    req.onblocked = () => resolve(null);
  });
}

/** Look up a cached poster by media URL. Returns the data URL string
 *  on hit, `null` on miss / stale / error. Stale entries are deleted
 *  eagerly so they don't pile up indefinitely. */
export async function getPoster(url: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readonly");
    } catch {
      resolve(null);
      return;
    }
    const req = tx.objectStore(STORE).get(url);
    req.onsuccess = () => {
      const entry = req.result as PosterEntry | undefined;
      if (!entry) {
        resolve(null);
        return;
      }
      if (Date.now() - entry.capturedAt > MAX_AGE_MS) {
        // Fire-and-forget eviction. Another transaction so we don't
        // need to upgrade the current read txn to readwrite.
        void deletePoster(url);
        resolve(null);
        return;
      }
      resolve(entry.dataUrl);
    };
    req.onerror = () => resolve(null);
  });
}

/** Persist a captured frame for a media URL. Silently no-ops on
 *  storage / quota errors — the data URL is still usable in-memory by
 *  the caller for the current session. */
export async function setPoster(url: string, dataUrl: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readwrite");
    } catch {
      resolve();
      return;
    }
    const entry: PosterEntry = { url, dataUrl, capturedAt: Date.now() };
    const req = tx.objectStore(STORE).put(entry);
    req.onsuccess = () => resolve();
    // QuotaExceededError lands here. Surface to logs in dev if you
    // need it, but never throw — the video still works.
    req.onerror = () => resolve();
  });
}

/** Remove a single entry. Used only by the staleness eviction path
 *  inside `getPoster`; not exported for general callers. */
function deletePoster(url: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve();
          return;
        }
        let tx: IDBTransaction;
        try {
          tx = db.transaction(STORE, "readwrite");
        } catch {
          resolve();
          return;
        }
        const req = tx.objectStore(STORE).delete(url);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      }),
  );
}
