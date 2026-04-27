// Wrapper around localStorage. Defensive: every read tolerates corrupted
// JSON or read failures; every write surfaces quota errors so callers can
// react (toast, abort upload, prompt cleanup) instead of failing silently.
//
// The shape is async-ready so swapping to a real backend later only
// changes the implementation.

import type { CaseRecord, User } from "./types";
import { ADMIN_CREDENTIALS } from "./env";
import { log } from "./log";

const isBrowser = () => typeof window !== "undefined";

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
 * branch without `try/catch`. The `reason` distinguishes between
 * `quota` (user can free space and retry), `unavailable` (storage
 * disabled / private browsing — can't recover client-side), and
 * `unknown` (anything else; treat as transient).
 */
export type WriteResult = { ok: true } | { ok: false; reason: "quota" | "unavailable" | "unknown" };

function safeRead<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    log.warn("Corrupted JSON in localStorage", { area: "store", key }, err);
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): WriteResult {
  if (!isBrowser()) return { ok: false, reason: "unavailable" };
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (err) {
    // Detect quota errors across browsers without depending on the
    // DOMException constructor — Safari, Firefox and Chrome all expose
    // distinguishing names/codes, and some non-browser environments
    // (test runners) wrap the error differently.
    const e = err as { name?: string; code?: number; message?: string };
    const isQuota =
      e?.code === 22 ||
      e?.code === 1014 ||
      e?.name === "QuotaExceededError" ||
      e?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      /quota/i.test(e?.message || "");
    if (isQuota) {
      log.warn("localStorage quota exceeded", { area: "store", key });
      return { ok: false, reason: "quota" };
    }
    log.error("Unknown localStorage write failure", { area: "store", key }, err);
    return { ok: false, reason: "unknown" };
  }
}

function safeRemove(key: string) {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(key);
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
    return safeRead<User | null>("pocus_user", null);
  },
  /** Persist a session blob. Caller must ensure expiry/role correctness. */
  setUser(u: User): WriteResult {
    return safeWrite("pocus_user", u);
  },
  /** Drop the persisted session. No-op if none exists. */
  clearUser() {
    safeRemove("pocus_user");
  },
  /** Favorites for a given email. Defaults to `"guest"` for anon users. */
  getFavs(email?: string | null): string[] {
    return safeRead<string[]>(`pocus_favs_${email || "guest"}`, []);
  },
  /** Replace the favorites list for an email. */
  setFavs(email: string | null | undefined, favs: string[]): WriteResult {
    return safeWrite(`pocus_favs_${email || "guest"}`, favs);
  },
  /** Admin-authored case list. Includes soft-deleted entries. */
  getUserCases(): CaseRecord[] {
    return safeRead<CaseRecord[]>("pocus_user_cases", []);
  },
  /** Replace the admin-authored case list. */
  setUserCases(cs: CaseRecord[]): WriteResult {
    return safeWrite("pocus_user_cases", cs);
  },
  /**
   * Approximate bytes used by `pocus_*` keys. Useful for the admin
   * panel to surface storage pressure before a write fails. Returns 0
   * on the server. Multiplies length by 2 (UTF-16 worst case).
   */
  estimateUsage(): number {
    if (!isBrowser()) return 0;
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith("pocus_")) continue;
        const v = localStorage.getItem(k) ?? "";
        total += k.length + v.length;
      }
    } catch {
      /* ignore */
    }
    return total * 2; // UTF-16 approx
  },
};
