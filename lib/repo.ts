// Repository facade — single boundary between the UI and persistence.
//
// At runtime the facade dispatches to one of three backends:
//
//   - Firebase Auth + Firestore, when `IS_FIREBASE_ENABLED` is true
//     (see `lib/firebase.ts` and ADR-0004).
//   - Netlify Postgres dual-write (local + DB mirror, DB-first reads),
//     when `IS_NETLIFY_DB_ENABLED` is true. See `lib/repo/dual-write.ts`.
//   - localStorage via `lib/store.ts`, otherwise. This is the dev /
//     demo default and the path that the unit tests exercise.
//
// Components import only `auth`, `cases`, `favs`, `repo`. They never
// see the dispatch boundary. Each backend lives in its own file so this
// module stays focused on dispatch + the public-facing namespaces.
//
// Backend implementations:
//   - `lib/repo/local-cases.ts` — localStorage cases backend
//   - `lib/repo/local-favs.ts`  — localStorage favs backend
//   - `lib/repo/dual-write.ts`  — Netlify DB dual-write wrappers
//   - `lib/firebase-*.ts`       — Firebase backends (lazy-loaded)

import { Store } from "./store";
import { ADMIN_CREDENTIALS, IS_FIREBASE_ENABLED, IS_NETLIFY_DB_ENABLED } from "./env";
import { log } from "./log";
import { AuthError } from "./errors";
import type { CaseRecord, User } from "./types";
import type { ListPagedOptions } from "./repo-types";
import { localCases, type CasesRepo } from "./repo/local-cases";
import { localFavs, type FavsRepo } from "./repo/local-favs";
import { dualWriteCases, dualWriteFavs } from "./repo/dual-write";
import { setSessionAction, clearSessionAction } from "@/app/actions/session";

// Re-export the pagination contract so existing consumers that import
// from `@/lib/repo` keep working.
export type { Cursor, ListPagedOptions, ListPagedResult } from "./repo-types";

// Session lifetimes. Admin sessions expire faster — they hold privileges,
// so the smaller blast radius if the device is left unattended matters
// more than the convenience of staying logged in.
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000; // 8 hours
const USER_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function makeUser(email: string, name: string | undefined, isAdmin: boolean): User {
  // `email.split("@")[0]` may be undefined under noUncheckedIndexedAccess,
  // even though split always yields at least one element. Coalesce to
  // the email itself rather than asserting.
  const displayName = isAdmin ? "Administrador" : name || email.split("@")[0] || email;
  const initials = isAdmin
    ? "AD"
    : displayName
        .split(/[\s.@]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => (s[0] ?? "").toUpperCase())
        .join("");
  const issuedAt = Date.now();
  const expiresAt = issuedAt + (isAdmin ? ADMIN_SESSION_MS : USER_SESSION_MS);
  return {
    email,
    name: displayName,
    initials,
    role: isAdmin ? "admin" : "user",
    issuedAt,
    expiresAt,
  };
}

function isValidUser(u: unknown): u is User {
  if (!u || typeof u !== "object") return false;
  const r = u as Partial<User>;
  return (
    typeof r.email === "string" &&
    typeof r.role === "string" &&
    (r.role === "admin" || r.role === "user") &&
    typeof r.expiresAt === "number" &&
    typeof r.issuedAt === "number"
  );
}

// ─── Local (localStorage) auth backend ───────────────────────────────────────

const localAuth = {
  async current(): Promise<User | null> {
    const raw = Store.getUser();
    if (!raw) return null;
    if (!isValidUser(raw)) {
      log.warn("Discarding malformed session", { area: "auth" });
      Store.clearUser();
      return null;
    }
    if (raw.expiresAt < Date.now()) {
      log.info("Session expired", { area: "auth", email: raw.email });
      Store.clearUser();
      return null;
    }
    return raw;
  },
  async login(email: string, password: string, name?: string): Promise<User> {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      log.warn("Login attempt with empty email", { area: "auth" });
      throw new AuthError("missing_email", "Correo requerido");
    }
    const isAdminEmail = trimmed === ADMIN_CREDENTIALS.email;
    if (isAdminEmail && password !== ADMIN_CREDENTIALS.password) {
      log.warn("Failed admin login", { area: "auth", email: trimmed });
      throw new AuthError("wrong_admin_password", "Credenciales de administrador incorrectas");
    }
    const user = makeUser(email, name, isAdminEmail);
    const result = Store.setUser(user);
    if (!result.ok) {
      log.error("Failed to persist session", { area: "auth", reason: result.reason });
      throw new AuthError("unknown", "No se pudo persistir la sesión");
    }
    // Mint the server-side session cookie. Best-effort: if the
    // server is unreachable or `AUTH_SECRET` is missing in prod,
    // the local session still works but DB writes will be rejected
    // (the user will see the mirror-failure toast). We don't block
    // login on the cookie request — `setSessionAction` is fast in
    // practice and a delayed cookie just means the first DB write
    // after login may fail until the cookie lands.
    void setSessionAction({
      email: user.email,
      role: user.role,
      expiresAt: user.expiresAt,
    }).catch((err) => log.warn("Failed to set server session cookie", { area: "auth" }, err));
    log.info("Login success", {
      area: "auth",
      email: user.email,
      role: user.role,
      expiresAt: new Date(user.expiresAt).toISOString(),
    });
    return user;
  },
  async logout(): Promise<void> {
    const u = Store.getUser();
    if (u) log.info("Logout", { area: "auth", email: u.email });
    Store.clearUser();
    // Clear the server session cookie too. Fire-and-forget — if the
    // network is down the cookie will eventually expire on its own,
    // and we still cleared the local session.
    void clearSessionAction().catch((err) =>
      log.warn("Failed to clear server session cookie", { area: "auth" }, err),
    );
  },
  async msUntilExpiry(): Promise<number> {
    const u = await this.current();
    if (!u) return 0;
    return Math.max(0, u.expiresAt - Date.now());
  },
};

// ─── Dispatch ────────────────────────────────────────────────────────────────
//
// The Firebase backend lives in sibling files. We import lazily so that
// when the feature flag is off, the firebase JS SDK isn't pulled into
// the bundle for the dev/demo path.

type AuthRepo = typeof localAuth;

let _auth: AuthRepo = localAuth;
let _cases: CasesRepo = localCases;
let _favs: FavsRepo = localFavs;

// Netlify DB dual-write activates synchronously when the flag is set.
// No async initialization needed — the wrappers compose with localCases
// at module load. Firebase, when configured, takes precedence below
// because it replaces the entire local backend (auth + cases + favs).
if (IS_NETLIFY_DB_ENABLED) {
  _cases = dualWriteCases;
  _favs = dualWriteFavs;
  log.info("Netlify DB dual-write active", { area: "repo" });
}

/* v8 ignore start — Firebase dispatch path requires a configured project */
if (IS_FIREBASE_ENABLED) {
  // Sync require would force eager bundling; we use import() at module
  // load and synchronously assign once resolved. There's a brief
  // microtask window where the local backend answers — in practice the
  // app awaits hydration before any read, so this is safe.
  void (async () => {
    try {
      const [{ firebaseAuthRepo }, { firebaseCasesRepo }, { firebaseFavsRepo }] = await Promise.all(
        [import("./firebase-auth"), import("./firebase-cases"), import("./firebase-favs")],
      );
      _auth = firebaseAuthRepo;
      _cases = firebaseCasesRepo;
      _favs = firebaseFavsRepo;
      log.info("Firebase backend active", { area: "repo" });
    } catch (err) {
      log.error("Failed to load Firebase backend; staying on localStorage", { area: "repo" }, err);
    }
  })();
}
/* v8 ignore stop */

/**
 * Auth namespace. Discriminates by `IS_FIREBASE_ENABLED` at boot;
 * during the brief async window before Firebase loads, the local
 * backend answers — no observable effect on the UI because hydration
 * runs after a tick anyway.
 */
export const auth = {
  current: () => _auth.current(),
  login: (email: string, password: string, name?: string) => _auth.login(email, password, name),
  logout: () => _auth.logout(),
  msUntilExpiry: () => _auth.msUntilExpiry(),
};

export const cases = {
  listSeed: () => _cases.listSeed(),
  listUserRaw: () => _cases.listUserRaw(),
  listUser: () => _cases.listUser(),
  listTrashed: () => _cases.listTrashed(),
  listAll: () => _cases.listAll(),
  /**
   * Paged listing. Use this once the catalog grows past a few hundred
   * cases — the Firebase migration will plug in here without touching
   * the consumer. See `ListPagedOptions` / `ListPagedResult` for the
   * contract. `listAll()` (eager) is still fine for the small atlas.
   */
  listAllPaged: (options: ListPagedOptions) => _cases.listAllPaged(options),
  save: (c: CaseRecord, current: CaseRecord[]) => _cases.save(c, current),
  remove: (id: string, current: CaseRecord[], by?: string) => _cases.remove(id, current, by),
  restore: (id: string, current: CaseRecord[]) => _cases.restore(id, current),
  purge: (id: string, current: CaseRecord[]) => _cases.purge(id, current),
  // Per-case overrides — see `_cases.setOverride` for the rationale.
  listOverrides: () => _cases.listOverrides(),
  /**
   * Synchronous override read for first-render hydration. Always
   * goes through `Store` (localStorage) — the DB-first path is async
   * and would re-introduce the count flicker the override pattern
   * was meant to hide. Hooks can use this in the lazy-initialState
   * form of `useState` so the initial paint already reflects deletes
   * / purges / reclassifications. The async `listOverrides()` runs
   * after mount and refines if the DB has fresher state.
   */
  listOverridesCached: (): Record<string, Partial<CaseRecord>> => Store.getCaseOverrides(),
  setOverride: (id: string, patch: Partial<CaseRecord>) => _cases.setOverride(id, patch),
  clearOverride: (id: string) => _cases.clearOverride(id),
  /**
   * Permanent-delete a seed/imported case (irreversible from inside
   * the app). `mediaKey` is the blob-store key extracted from the
   * case's `media.src` via `mediaKeyFromSrc`; pass `null` if the case
   * has no real media (synthetic loop only) or its src isn't a
   * `/api/media/*` URL.
   */
  purgeImported: (id: string, mediaKey: string | null) => _cases.purgeImported(id, mediaKey),
};

export const favs = {
  list: (email?: string | null) => _favs.list(email),
  toggle: (email: string | null | undefined, id: string, current: string[]) =>
    _favs.toggle(email, id, current),
};

export const repo = { auth, cases, favs };
