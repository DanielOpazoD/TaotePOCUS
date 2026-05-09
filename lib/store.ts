// Wrapper around localStorage. Defensive: every read tolerates corrupted
// JSON or read failures; every write surfaces quota errors so callers can
// react (toast, abort upload, prompt cleanup) instead of failing silently.
//
// Storage backend with fallback chain (probed once at module load):
//
//   1. `localStorage` — the default. Persists across sessions, ~5 MB cap.
//   2. In-memory shim — when localStorage isn't usable. Triggers in:
//      - Safari Private Mode (`localStorage.setItem` throws on every
//        write since iOS 11+ even though the global exists).
//      - Sandboxed iframes without `allow-same-origin`.
//      - Some embedded webviews / older browsers.
//      The shim mimics the `Storage` API surface (getItem / setItem /
//      removeItem / key / length) so the rest of the module doesn't
//      branch on the backend. Data lives only for the lifetime of the
//      tab — explicit trade-off: the app keeps working, the user
//      knows they're on a transient session.
//
// The shape is async-ready so swapping to a real backend later only
// changes the implementation.

import type { CaseRecord, User } from "./types";
import { ADMIN_CREDENTIALS } from "./env";
import { log } from "./log";
import { STORAGE_KEYS, STORAGE_PREFIX, favsKey } from "./storage-keys";
import { validateCorpus, validateFavsList, validateOverrideMap } from "./schemas";

const isBrowser = () => typeof window !== "undefined";

/**
 * Minimal `Storage`-compatible interface used by the rest of the
 * module. The real `localStorage` satisfies this. The in-memory
 * shim below also does.
 */
interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

/**
 * In-memory shim. Used when `localStorage` is unavailable — keeps
 * the app functional for the session, then forgets on tab close.
 * The interface matches what the rest of `Store` calls (no
 * Storage prototype magic), so a switch is invisible to callers.
 */
function makeMemoryStore(): MinimalStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/**
 * One-shot probe for localStorage usability. Runs lazily on first
 * access (after `isBrowser` confirms `window` exists). Caches the
 * result so we don't probe on every read.
 */
let cachedBackend: MinimalStorage | null = null;
let backendIsMemory = false;

function getBackend(): MinimalStorage | null {
  if (!isBrowser()) return null;
  if (cachedBackend) return cachedBackend;
  // Probe with a write the browser will reject early if storage
  // isn't usable (Safari Private throws here, normal browsers don't).
  try {
    const probeKey = `${STORAGE_PREFIX}__probe__`;
    localStorage.setItem(probeKey, "1");
    localStorage.removeItem(probeKey);
    cachedBackend = localStorage as unknown as MinimalStorage;
  } catch (err) {
    log.warn(
      "localStorage unavailable; falling back to in-memory storage (data won't persist past this tab)",
      { area: "store" },
      err,
    );
    cachedBackend = makeMemoryStore();
    backendIsMemory = true;
  }
  return cachedBackend;
}

/**
 * True when the active backend is the in-memory shim (Safari Private
 * Mode, sandboxed iframe, etc.). Surfaces to the UI via a small
 * banner so the user knows their session is transient.
 *
 * SSR-safe: returns false when `window` is undefined (no probe ran).
 */
export function isUsingMemoryStorage(): boolean {
  if (!isBrowser()) return false;
  // Force the probe so the result is meaningful at the time of the call.
  getBackend();
  return backendIsMemory;
}

/**
 * Expose the resolved backend for adjacent modules that need to
 * iterate / read raw values without going through `Store`'s typed
 * methods (notably `lib/backup.ts` which walks every `pocus_*`
 * key for the export bundle). Returns `null` on the server so
 * SSR-safe call sites just bail.
 *
 * Internal — not part of the `Store` public surface. If a third
 * caller appears, consider promoting a typed iteration helper
 * onto `Store` itself instead.
 */
export function getStorageBackend(): MinimalStorage | null {
  return getBackend();
}

/**
 * Test-only: reset the probe so each test gets a fresh chance to
 * pick a backend. Production code never imports this.
 */
export function __resetStorageBackendForTests(): void {
  cachedBackend = null;
  backendIsMemory = false;
}

/**
 * Demo admin credentials. Re-exported here for the few callers (tests,
 * `AuthModal` hint block) that already imported from this module before
 * `lib/env.ts` existed. New code should import from `lib/env.ts`
 * directly. Kept as `const` so the existing `Property 'email' does not
 * exist on type ...` checks keep working.
 */
export const ADMIN_CREDS = ADMIN_CREDENTIALS;

/**
 * Result of a write to the store. Discriminated union so callers can
 * branch without `try/catch`. The `reason` distinguishes between:
 *
 *   - `quota` (user can free space and retry).
 *   - `unavailable` (storage disabled / private browsing — can't
 *     recover client-side).
 *   - `auth_required` (the server-side write needed a session and
 *     the cookie was missing or expired; user can re-login).
 *   - `forbidden` (server-side authorization rejected the write —
 *     wrong role, or owner mismatch on a row).
 *   - `unknown` (anything else; treat as transient).
 *
 * `auth_required` and `forbidden` came from the Server Action
 * surface (see `app/actions/db.ts`) when the dual-write path
 * started awaiting the DB result instead of fire-and-forgetting
 * (Stage-4 partial, ADR-0011). They flow through the local-write
 * shape so consumers branch on a single union.
 */
export type WriteResult =
  | { ok: true }
  | {
      ok: false;
      reason: "quota" | "unavailable" | "unknown" | "auth_required" | "forbidden";
    };

function safeRead<T>(key: string, fallback: T): T {
  const backend = getBackend();
  if (!backend) return fallback;
  try {
    const raw = backend.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    log.warn("Corrupted JSON in storage", { area: "store", key }, err);
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): WriteResult {
  const backend = getBackend();
  if (!backend) return { ok: false, reason: "unavailable" };
  try {
    backend.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (err) {
    // Detect quota errors across browsers without depending on the
    // DOMException constructor — Safari, Firefox and Chrome all expose
    // distinguishing names/codes, and some non-browser environments
    // (test runners) wrap the error differently. The in-memory shim
    // doesn't throw quota errors at all (a Map has no fixed cap), so
    // this branch only fires on the real localStorage backend.
    const e = err as { name?: string; code?: number; message?: string };
    const isQuota =
      e?.code === 22 ||
      e?.code === 1014 ||
      e?.name === "QuotaExceededError" ||
      e?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      /quota/i.test(e?.message || "");
    if (isQuota) {
      log.warn("storage quota exceeded", { area: "store", key });
      return { ok: false, reason: "quota" };
    }
    log.error("Unknown storage write failure", { area: "store", key }, err);
    return { ok: false, reason: "unknown" };
  }
}

function safeRemove(key: string) {
  const backend = getBackend();
  if (!backend) return;
  try {
    backend.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Low-level persistence. Key/value access to `localStorage` with safe
 * read/write semantics.
 *
 * **Do not import from this module in components.** Callers go through
 * `lib/repo.ts` which holds the domain rules (session expiry, soft
 * delete, audit trail). The architecture document explains the
 * boundary; the dependency graph is enforced informally — keep it
 * intact when extending.
 */
export const Store = {
  /** Current persisted session (raw JSON). May be expired or malformed. */
  getUser(): User | null {
    return safeRead<User | null>(STORAGE_KEYS.user, null);
  },
  /** Persist a session blob. Caller must ensure expiry/role correctness. */
  setUser(u: User): WriteResult {
    return safeWrite(STORAGE_KEYS.user, u);
  },
  /** Drop the persisted session. No-op if none exists. */
  clearUser() {
    safeRemove(STORAGE_KEYS.user);
  },
  /** Favorites for a given email. Defaults to `"guest"` for anon
   *  users. The result is validated through `validateFavsList`
   *  before reaching the consumer — a corrupt entry in storage
   *  (e.g., truncated write or hand-edit) returns `[]` rather than
   *  crashing the favs hook. */
  getFavs(email?: string | null): string[] {
    return validateFavsList(safeRead<unknown>(favsKey(email), []), "store.getFavs");
  },
  /** Replace the favorites list for an email. */
  setFavs(email: string | null | undefined, favs: string[]): WriteResult {
    return safeWrite(favsKey(email), favs);
  },
  /** Admin-authored case list (live + soft-deleted). Validated on
   *  read so a corrupt localStorage entry from a stale tab or a
   *  partially-completed import doesn't poison the merge layer. */
  getUserCases(): CaseRecord[] {
    return validateCorpus(safeRead<unknown>(STORAGE_KEYS.userCases, []), "store.getUserCases")
      .cases;
  },
  /** Replace the admin-authored case list. */
  setUserCases(cs: CaseRecord[]): WriteResult {
    return safeWrite(STORAGE_KEYS.userCases, cs);
  },
  /**
   * Per-case override map keyed by case id. Each entry is a
   * `Partial<CaseRecord>` — the admin can override any field
   * (title, classification, tags, position, summary, findings…)
   * without modifying the upstream catalog file. Survives
   * `apply-twitter-import.mjs` regenerations because overrides
   * live in localStorage, not in the corpus JSON.
   *
   * Validated on read: malformed override entries are dropped
   * silently. Entries with malformed individual fields (e.g.,
   * `tags: "string"` instead of `string[]`) keep the rest of the
   * patch and drop the bad field. Better than discarding a whole
   * override because one field went sideways.
   */
  getCaseOverrides(): Record<string, Partial<CaseRecord>> {
    return validateOverrideMap(
      safeRead<unknown>(STORAGE_KEYS.caseOverrides, {}),
      "store.getCaseOverrides",
    ).overrides;
  },
  setCaseOverrides(map: Record<string, Partial<CaseRecord>>): WriteResult {
    return safeWrite(STORAGE_KEYS.caseOverrides, map);
  },
  /**
   * Approximate bytes used by `pocus_*` keys. Useful for the admin
   * panel to surface storage pressure before a write fails. Returns 0
   * on the server. Multiplies length by 2 (UTF-16 worst case).
   */
  estimateUsage(): number {
    const backend = getBackend();
    if (!backend) return 0;
    let total = 0;
    try {
      for (let i = 0; i < backend.length; i++) {
        const k = backend.key(i);
        if (!k || !k.startsWith(STORAGE_PREFIX)) continue;
        const v = backend.getItem(k) ?? "";
        total += k.length + v.length;
      }
    } catch {
      /* ignore */
    }
    return total * 2; // UTF-16 approx
  },
};
