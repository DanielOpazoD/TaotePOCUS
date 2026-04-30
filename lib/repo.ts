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
import { ADMIN_CREDENTIALS, IS_FIREBASE_ENABLED, IS_NETLIFY_DB_ENABLED } from "./env";
import { SEED_CASES } from "./data";
import { log } from "./log";
import { AuthError } from "./errors";
import { notifyMirrorFailure } from "./db-mirror";
import type { CaseRecord, User } from "./types";
import {
  dbListOverrides,
  dbListUserCases,
  dbListFavs,
  dbSetOverride,
  dbClearOverride,
  dbSaveUserCase,
  dbRemoveUserCase,
  dbRestoreUserCase,
  dbPurgeUserCase,
  dbSetFavs,
} from "@/app/actions/db";

// ─── Pagination contract ─────────────────────────────────────────────────────
//
// Defined now (even though localStorage answers in one shot) so the
// Firebase backend doesn't require a consumer-side refactor when it
// arrives. Cursor is opaque to callers — the only operations are
// "use this cursor to fetch more" and "the result has no nextCursor →
// you're at the end". The local backend encodes the index into a
// numeric string; Firestore will encode a document snapshot.

/**
 * Opaque pagination cursor. Treat as a string token. `null` is
 * "start from the beginning"; `undefined` in a query is the same.
 */
export type Cursor = string | null;

/** Result of a paged listing. */
export interface ListPagedResult<T> {
  /** The page of results. May be empty if the cursor is past the end. */
  items: T[];
  /** Cursor for the next page. `null` means "no more results". */
  nextCursor: Cursor;
  /** Total count, when the backend can answer cheaply. Optional —
   *  Firestore can't always provide this without a separate count query. */
  total?: number;
}

/**
 * Pagination query options. `limit` is required so the backend can
 * cap the page size; `cursor` is optional (omit / pass null for the
 * first page).
 */
export interface ListPagedOptions {
  cursor?: Cursor;
  limit: number;
}

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

/**
 * Cursor encoding for the local backend: a numeric string. The string
 * shape is intentionally opaque — callers should never parse it. When
 * the Firebase backend lands, the encoding becomes a base64-encoded
 * document snapshot ID and the contract is unchanged.
 */
function encodeCursor(index: number): Cursor {
  return String(index);
}
function decodeCursor(cursor: Cursor | undefined): number {
  if (cursor == null || cursor === "") return 0;
  const n = Number(cursor);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
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
  /**
   * Paged variant of `listAll`. The local backend encodes the cursor
   * as the next index into the combined list — Firestore will replace
   * this with a doc-snapshot-based cursor without changing the contract.
   *
   * The cursor is opaque to callers; `null` means "no more pages".
   */
  async listAllPaged({ cursor, limit }: ListPagedOptions): Promise<ListPagedResult<CaseRecord>> {
    const all = await this.listAll();
    // Decode cursor → start index. Empty / null / unparseable → 0.
    const start = decodeCursor(cursor);
    if (start >= all.length) {
      return { items: [], nextCursor: null, total: all.length };
    }
    const end = Math.min(start + limit, all.length);
    const items = all.slice(start, end);
    const nextCursor = end < all.length ? encodeCursor(end) : null;
    return { items, nextCursor, total: all.length };
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
  // ─── Per-case overrides ────────────────────────────────────────────
  // Admin-authored field overrides for any case in the catalog (seed
  // or imported). The override map is `id → Partial<CaseRecord>`; the
  // consumer merges it on top of the source case at render time. This
  // lets `scripts/apply-twitter-import.mjs` regenerate the imported
  // cases freely without nuking the admin's reclassifications.
  async listOverrides(): Promise<Record<string, Partial<CaseRecord>>> {
    return Store.getCaseOverrides();
  },
  async setOverride(id: string, patch: Partial<CaseRecord>): Promise<WriteResult> {
    const all = Store.getCaseOverrides();
    // Drop fields that are explicitly set to undefined — caller's
    // signal for "use the source value", not "set this to undefined".
    const cleaned: Partial<CaseRecord> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (cleaned as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(cleaned).length === 0) {
      // Empty patch → drop the entry entirely.
      delete all[id];
    } else {
      all[id] = cleaned;
    }
    log.info("Case override saved", { area: "cases", id, fields: Object.keys(cleaned) });
    return Store.setCaseOverrides(all);
  },
  async clearOverride(id: string): Promise<WriteResult> {
    const all = Store.getCaseOverrides();
    delete all[id];
    log.info("Case override cleared", { area: "cases", id });
    return Store.setCaseOverrides(all);
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

// ─── Dual-write to Netlify Database ──────────────────────────────────────────
//
// When `IS_NETLIFY_DB_ENABLED` is true, every successful mutation on the
// local backend is also mirrored to Postgres via the server actions in
// `app/actions/db.ts`. The DB write is fire-and-forget — it never blocks
// the local op or surfaces an error to the UI. If the mirror fails (DB
// down, network blip, server action error) the local write still
// succeeded and the user sees a normal completion. A periodic sync /
// reconciliation step (future commit) will close any drift.
//
// Reads stay local for now. The transition stages are documented in
// `lib/env.ts` next to the flag definition.

/**
 * Best-effort identity for the mirror. We don't have user state piped
 * through the repo facade today, so we read from `Store` (the same
 * place `useSession` reads). Returns `null` for guest / unloaded.
 */
function currentMirrorEmail(): string | null {
  try {
    const u = Store.getUser();
    return u?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget DB mirror. Logs warnings on failure but never throws
 * out of the caller's promise chain. We deliberately don't `await` so
 * the local write returns immediately — the mirror catches up when it
 * can.
 *
 * Stage 4: failures are also pushed through `notifyMirrorFailure` so
 * the UI can surface a toast. The repo doesn't know about React state
 * — the handler registered by `App.tsx` does the rate-limiting and
 * the actual toast call.
 */
function mirror<T>(area: string, p: Promise<T>): void {
  void p
    .then((r) => {
      // Detect the WriteResult-shaped failure from our own actions.
      if (r && typeof r === "object" && "ok" in r && (r as { ok: boolean }).ok === false) {
        log.warn(`DB mirror returned not-ok`, { area });
        notifyMirrorFailure(area);
      }
    })
    .catch((err) => {
      log.warn(`DB mirror failed`, { area }, err);
      notifyMirrorFailure(area);
    });
}

/**
 * DB-first read with local fallback. The contract:
 *
 *   - Try the server action; on success, refresh the local cache so
 *     the next reload sees the same state without a roundtrip and
 *     return the DB data.
 *   - If the DB returns empty, treat that as "DB hasn't been hydrated
 *     yet" and prefer local. Avoids the failure mode where flipping
 *     the flag on a pristine DB nukes a populated localStorage.
 *   - If the DB read throws (network blip / function cold-start
 *     timeout / 401), log and fall back to local — the UI keeps
 *     working from the cache while the DB is unreachable.
 *
 * `isEmpty` is the predicate used to detect "nothing in the DB". For
 * a record map it's `Object.keys(...).length === 0`; for an array
 * it's `length === 0`; etc. Each caller provides the right test for
 * its shape.
 */
async function dbFirst<T>(
  area: string,
  fetchDb: () => Promise<T>,
  isEmpty: (v: T) => boolean,
  cacheLocal: (v: T) => void,
  fallbackLocal: () => Promise<T>,
): Promise<T> {
  try {
    const dbData = await fetchDb();
    if (!isEmpty(dbData)) {
      cacheLocal(dbData);
      return dbData;
    }
  } catch (err) {
    log.warn(`DB read failed, falling back to local`, { area }, err);
  }
  return fallbackLocal();
}

// User-cases loader, factored out so the chain of read methods
// (`listUser`, `listTrashed`, `listAll`, `listAllPaged`) all share the
// same DB-first pull without duplicating the fallback logic.
async function loadUserRaw(): Promise<CaseRecord[]> {
  return dbFirst(
    "cases.listUserRaw",
    () => dbListUserCases(),
    (v) => v.length === 0,
    (v) => Store.setUserCases(v),
    () => localCases.listUserRaw(),
  );
}

const dualWriteCases: CasesRepo = {
  ...localCases,
  // ─── Reads (DB-first with local fallback) ──────────────────────
  listOverrides: () =>
    dbFirst(
      "cases.listOverrides",
      () => dbListOverrides(),
      (v) => Object.keys(v).length === 0,
      (v) => Store.setCaseOverrides(v),
      () => localCases.listOverrides(),
    ),
  listUserRaw: loadUserRaw,
  listUser: async () => (await loadUserRaw()).filter((c) => !isDeleted(c)),
  listTrashed: async () => (await loadUserRaw()).filter(isDeleted),
  listAll: async () => {
    const [seed, user] = await Promise.all([
      localCases.listSeed(),
      (async () => (await loadUserRaw()).filter((c) => !isDeleted(c)))(),
    ]);
    return [...user, ...seed];
  },
  listAllPaged: async ({ cursor, limit }) => {
    // Replicate localCases.listAllPaged but starting from our DB-aware
    // listAll, so the paged listing also reads from the canonical
    // source.
    const seed = await localCases.listSeed();
    const user = (await loadUserRaw()).filter((c) => !isDeleted(c));
    const all = [...user, ...seed];
    const start = decodeCursor(cursor);
    if (start >= all.length) {
      return { items: [], nextCursor: null, total: all.length };
    }
    const end = Math.min(start + limit, all.length);
    const items = all.slice(start, end);
    const nextCursor = end < all.length ? encodeCursor(end) : null;
    return { items, nextCursor, total: all.length };
  },

  // ─── Writes (local first, DB mirror) ────────────────────────────
  // Order stays "local optimistically, DB best-effort" in this stage.
  // Stage 4 inverts this: DB becomes the source of truth and a write
  // failure surfaces to the UI.
  async save(c, current) {
    const r = await localCases.save(c, current);
    if (r.ok) {
      const isUpdate = current.some((x) => x.id === c.id);
      mirror("cases.save", dbSaveUserCase(c, currentMirrorEmail(), isUpdate));
    }
    return r;
  },
  async remove(id, current, by) {
    const r = await localCases.remove(id, current, by);
    if (r.ok) mirror("cases.remove", dbRemoveUserCase(id, by ?? currentMirrorEmail()));
    return r;
  },
  async restore(id, current) {
    const r = await localCases.restore(id, current);
    if (r.ok) mirror("cases.restore", dbRestoreUserCase(id));
    return r;
  },
  async purge(id, current) {
    const r = await localCases.purge(id, current);
    if (r.ok) mirror("cases.purge", dbPurgeUserCase(id));
    return r;
  },
  async setOverride(id, patch) {
    const r = await localCases.setOverride(id, patch);
    if (r.ok) mirror("cases.setOverride", dbSetOverride(id, patch, currentMirrorEmail()));
    return r;
  },
  async clearOverride(id) {
    const r = await localCases.clearOverride(id);
    if (r.ok) mirror("cases.clearOverride", dbClearOverride(id));
    return r;
  },
};

const dualWriteFavs: FavsRepo = {
  ...localFavs,
  list: (email?: string | null) =>
    dbFirst(
      "favs.list",
      () => dbListFavs(email ?? null),
      (v) => v.length === 0,
      (v) => Store.setFavs(email, v),
      () => localFavs.list(email),
    ),
  async toggle(email, id, current) {
    const out = await localFavs.toggle(email, id, current);
    if (out.result.ok) mirror("favs.toggle", dbSetFavs(email ?? null, out.next));
    return out;
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
  setOverride: (id: string, patch: Partial<CaseRecord>) => _cases.setOverride(id, patch),
  clearOverride: (id: string) => _cases.clearOverride(id),
};

export const favs = {
  list: (email?: string | null) => _favs.list(email),
  toggle: (email: string | null | undefined, id: string, current: string[]) =>
    _favs.toggle(email, id, current),
};

export const repo = { auth, cases, favs };
