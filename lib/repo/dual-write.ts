// Dual-write wrappers: the DB is now the source of truth on writes
// (Stage 4 partial — ADR-0011), while reads keep the DB-first +
// local-fallback contract from Stage 3 so the catalog stays
// readable when the DB is briefly unreachable.
//
// Write contract (post-ADR-0011):
//
//   1. Run the Server Action against Postgres FIRST.
//   2. If the DB write fails, return the failure to the caller.
//      The local cache is NOT touched — no zombie state in
//      localStorage that drifts from the source of truth.
//   3. If the DB write succeeds, mirror the result into the local
//      cache so subsequent reads hit it without a roundtrip.
//
// The previous "local first, fire-and-forget DB mirror" pattern
// (and the entire `notifyMirrorFailure` plumbing it required) is
// gone. The DB result is the contract; the only thing the local
// backend gives us now is read latency on a warm cache and a
// fallback when the DB is offline.
//
// Read contract is unchanged: try DB → on success refresh cache and
// return DB data; on empty/error fall back to the local cache so
// the UI keeps working through transient outages.
//
// Pulled out of `lib/repo.ts` so:
//   - The repo facade stays focused on dispatch + public exports.
//   - The dual-write logic has its own home where the DB-first
//     write contract is fully visible.
//   - Future backends (Firebase, etc.) can live in sibling files
//     without competing for space in the dispatch module.

import { Store, type WriteResult } from "../store";
import { log } from "../log";
import type { CaseRecord } from "../types";
import {
  dbListOverrides,
  dbListUserCases,
  dbListFavs,
  dbSetOverride,
  dbClearOverride,
  dbPurgeImported,
  dbSaveUserCase,
  dbRemoveUserCase,
  dbRestoreUserCase,
  dbPurgeUserCase,
  dbSetFavs,
} from "@/app/actions/db";
import { isDeleted, encodeCursor, decodeCursor, localCases, type CasesRepo } from "./local-cases";
import { localFavs, type FavsRepo } from "./local-favs";

/**
 * Best-effort identity for the audit fields the Server Actions
 * accept. We don't have user state piped through the repo facade
 * today, so we read from `Store` (the same place `useSession`
 * reads). Returns `null` for guest / unloaded — the Server Action
 * sources the actual audit identity from the session cookie
 * regardless, this is just back-compat for the call shape.
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
 * Adapt a DB Server Action result to the `WriteResult` shape that
 * UI consumers branch on. Both unions share `ok`; the failure
 * reasons map 1:1 since `WriteResult` widened to include
 * `auth_required` / `forbidden` in ADR-0011.
 */
type ActionResult = { ok: true } | { ok: false; reason: "unknown" | "auth_required" | "forbidden" };
function fromAction(r: ActionResult): WriteResult {
  if (r.ok) return { ok: true };
  return { ok: false, reason: r.reason };
}

/**
 * DB-first read with local fallback. Unchanged from Stage 3.
 *
 *   - Try the server action; on success, refresh the local cache
 *     so the next reload sees the same state without a roundtrip.
 *   - If the DB returns empty, treat that as "DB hasn't been
 *     hydrated yet" and prefer local — avoids the failure mode
 *     where flipping the flag on a pristine DB nukes a populated
 *     localStorage.
 *   - If the DB read throws (network blip / function cold-start
 *     / 401), log and fall back to local. Reads are still
 *     graceful under transient DB outages.
 *
 * `isEmpty` is the "nothing in the DB" predicate. For a record map
 * it's `Object.keys(...).length === 0`; for an array it's
 * `length === 0`; etc.
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
// (`listUser`, `listTrashed`, `listAll`, `listAllPaged`) all share
// the same DB-first pull without duplicating the fallback logic.
async function loadUserRaw(): Promise<CaseRecord[]> {
  return dbFirst(
    "cases.listUserRaw",
    () => dbListUserCases(),
    (v) => v.length === 0,
    (v) => Store.setUserCases(v),
    () => localCases.listUserRaw(),
  );
}

/**
 * Run a DB write and, on success, refresh the local cache via
 * `localOp`. On failure, return the DB error AS-IS — the local
 * cache stays unchanged so it doesn't drift from the source of
 * truth. The previous "local first, mirror best-effort" pattern
 * had the opposite shape and was the source of zombie state.
 */
async function dbThenLocal(
  area: string,
  dbCall: () => Promise<ActionResult>,
  localOp: () => Promise<WriteResult>,
): Promise<WriteResult> {
  let dbResult: ActionResult;
  try {
    dbResult = await dbCall();
  } catch (err) {
    log.warn(`DB write threw`, { area }, err);
    return { ok: false, reason: "unknown" };
  }
  if (!dbResult.ok) {
    log.warn(`DB write returned not-ok`, { area, reason: dbResult.reason });
    return fromAction(dbResult);
  }
  return localOp();
}

export const dualWriteCases: CasesRepo = {
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
    // Replicate localCases.listAllPaged but starting from our
    // DB-aware listAll, so the paged listing also reads from the
    // canonical source.
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

  // ─── Writes (DB authoritative, local cache follows) ────────────
  // Each method runs the DB Server Action FIRST. On failure the
  // local cache stays unchanged; the failure surfaces to the UI
  // through the WriteResult. On success the local cache is refreshed
  // so subsequent reads hit it without a roundtrip.
  async save(c, current) {
    const isUpdate = current.some((x) => x.id === c.id);
    return dbThenLocal(
      "cases.save",
      () => dbSaveUserCase(c, currentMirrorEmail(), isUpdate),
      () => localCases.save(c, current),
    );
  },
  async remove(id, current, by) {
    return dbThenLocal(
      "cases.remove",
      () => dbRemoveUserCase(id, by ?? currentMirrorEmail()),
      () => localCases.remove(id, current, by),
    );
  },
  async restore(id, current) {
    return dbThenLocal(
      "cases.restore",
      () => dbRestoreUserCase(id),
      () => localCases.restore(id, current),
    );
  },
  async purge(id, current) {
    return dbThenLocal(
      "cases.purge",
      () => dbPurgeUserCase(id),
      () => localCases.purge(id, current),
    );
  },
  async setOverride(id, patch) {
    return dbThenLocal(
      "cases.setOverride",
      () => dbSetOverride(id, patch, currentMirrorEmail()),
      () => localCases.setOverride(id, patch),
    );
  },
  async clearOverride(id) {
    return dbThenLocal(
      "cases.clearOverride",
      () => dbClearOverride(id),
      () => localCases.clearOverride(id),
    );
  },
  async purgeImported(id, mediaKey) {
    // Permanent destruction of a seed/imported case. The DB action
    // also deletes the blob from the media store; if the blob delete
    // fails the override tombstone still lands (per the Server
    // Action's own error handling). DB-first means a failed
    // tombstone on the server stops the local write — the case
    // still appears in the UI until the admin retries.
    return dbThenLocal(
      "cases.purgeImported",
      () => dbPurgeImported(id, mediaKey, currentMirrorEmail()),
      () => localCases.purgeImported(id, mediaKey),
    );
  },
};

export const dualWriteFavs: FavsRepo = {
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
    // The favs toggle returns `{ result, next }` — `next` is the
    // computed list either way. Compute once locally, send to the
    // DB; on failure return a not-ok result without touching the
    // local cache; on success commit the cache.
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    let dbResult: ActionResult;
    try {
      dbResult = await dbSetFavs(email ?? null, next);
    } catch (err) {
      log.warn(`DB favs.toggle threw`, { area: "favs.toggle" }, err);
      return { result: { ok: false, reason: "unknown" }, next: current };
    }
    if (!dbResult.ok) {
      log.warn(`DB favs.toggle returned not-ok`, {
        area: "favs.toggle",
        reason: dbResult.reason,
      });
      return { result: fromAction(dbResult), next: current };
    }
    return localFavs.toggle(email, id, current);
  },
};
