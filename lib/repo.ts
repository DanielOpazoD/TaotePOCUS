// Repository facade — single boundary between the UI and persistence.
//
// At runtime the facade dispatches to one of two backends:
//
//   - Firebase Auth + Firestore, when `IS_FIREBASE_ENABLED` is true
//     (see `lib/firebase.ts` and ADR-0004).
//   - localStorage via `lib/store.ts`, otherwise. This is the dev /
//     demo default and the path that the unit tests exercise.
//
// Components import only `auth`, `cases`, `favs`, `repo`. They never
// see the dispatch boundary. To migrate fully, drop the local backend
// entirely and re-route the exports to the firebase modules — but
// keeping both side by side simplifies dev (no account needed) and
// gives a clear local fallback if Firebase is misconfigured.

import { Store, type WriteResult } from "./store";
import { ADMIN_CREDENTIALS, IS_FIREBASE_ENABLED } from "./env";
import { SEED_CASES } from "./data";
import { log } from "./log";
import { AuthError } from "./errors";
import type { CaseRecord, User } from "./types";

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

// ─── Local (localStorage) backend ─────────────────────────────────────────────

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
  },
  async msUntilExpiry(): Promise<number> {
    const u = await this.current();
    if (!u) return 0;
    return Math.max(0, u.expiresAt - Date.now());
  },
};

function isDeleted(c: CaseRecord) {
  return Boolean(c.deletedAt);
}

const localCases = {
  async listSeed(): Promise<CaseRecord[]> {
    return SEED_CASES;
  },
  async listUserRaw(): Promise<CaseRecord[]> {
    return Store.getUserCases();
  },
  async listUser(): Promise<CaseRecord[]> {
    return (await this.listUserRaw()).filter((c) => !isDeleted(c));
  },
  async listTrashed(): Promise<CaseRecord[]> {
    return (await this.listUserRaw()).filter(isDeleted);
  },
  async listAll(): Promise<CaseRecord[]> {
    const [seed, user] = await Promise.all([this.listSeed(), this.listUser()]);
    return [...user, ...seed];
  },
  async save(c: CaseRecord, current: CaseRecord[]): Promise<WriteResult> {
    const exists = current.some((x) => x.id === c.id);
    const next = exists ? current.map((x) => (x.id === c.id ? c : x)) : [c, ...current];
    return Store.setUserCases(next);
  },
  async remove(id: string, current: CaseRecord[], by?: string): Promise<WriteResult> {
    const stamp = new Date().toISOString();
    const next = current.map((c) =>
      c.id === id ? { ...c, deletedAt: stamp, deletedBy: by || "unknown" } : c,
    );
    log.info("Case soft-deleted", { area: "cases", id, by });
    return Store.setUserCases(next);
  },
  async restore(id: string, current: CaseRecord[]): Promise<WriteResult> {
    const next = current.map((c) =>
      c.id === id ? { ...c, deletedAt: undefined, deletedBy: undefined } : c,
    );
    log.info("Case restored", { area: "cases", id });
    return Store.setUserCases(next);
  },
  async purge(id: string, current: CaseRecord[]): Promise<WriteResult> {
    const next = current.filter((c) => c.id !== id);
    log.info("Case purged", { area: "cases", id });
    return Store.setUserCases(next);
  },
};

const localFavs = {
  async list(email?: string | null): Promise<string[]> {
    return Store.getFavs(email);
  },
  async toggle(
    email: string | null | undefined,
    id: string,
    current: string[],
  ): Promise<{ result: WriteResult; next: string[] }> {
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    const result = Store.setFavs(email, next);
    return { result, next };
  },
};

// ─── Dispatch ────────────────────────────────────────────────────────────────
//
// The Firebase backend lives in sibling files. We import lazily so that
// when the feature flag is off, the firebase JS SDK isn't pulled into
// the bundle for the dev/demo path.

type AuthRepo = typeof localAuth;
type CasesRepo = typeof localCases;
type FavsRepo = typeof localFavs;

let _auth: AuthRepo = localAuth;
let _cases: CasesRepo = localCases;
let _favs: FavsRepo = localFavs;

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
  save: (c: CaseRecord, current: CaseRecord[]) => _cases.save(c, current),
  remove: (id: string, current: CaseRecord[], by?: string) => _cases.remove(id, current, by),
  restore: (id: string, current: CaseRecord[]) => _cases.restore(id, current),
  purge: (id: string, current: CaseRecord[]) => _cases.purge(id, current),
};

export const favs = {
  list: (email?: string | null) => _favs.list(email),
  toggle: (email: string | null | undefined, id: string, current: string[]) =>
    _favs.toggle(email, id, current),
};

export const repo = { auth, cases, favs };
