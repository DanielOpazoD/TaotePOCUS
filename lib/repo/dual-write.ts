// Dual-write wrappers that compose around the local backends and
// mirror every successful mutation to Postgres via the server actions
// in `app/actions/db.ts`. Reads also flow DB-first with a local cache
// fallback (Stage 3 of the localStorage→Postgres transition; see
// `lib/env.ts > IS_NETLIFY_DB_ENABLED` for the full plan).
//
// Pulled out of `lib/repo.ts` so:
//   - The repo facade stays focused on dispatch + public exports.
//   - The dual-write logic has its own home where the
//     `local + remote` contract is fully visible.
//   - Future backends (Firebase, etc.) can live in sibling files
//     without competing for space in the dispatch module.

import { Store } from "../store";
import { log } from "../log";
import { notifyMirrorFailure } from "../db-mirror";
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
 * — the handler registered by `useMirrorFailureToast` does the rate-
 * limiting and the actual toast call.
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
  // Order stays "local optimistically, DB best-effort" because the
  // user expects instant UI feedback. If the mirror fails the
  // notifier surfaces a toast (Stage 4) and the admin can re-sync
  // via Backup → "Subir a base de datos".
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
  async purgeImported(id, mediaKey) {
    // Local first: write the `{ purged: true }` tombstone so the UI
    // hides the case immediately. Then mirror to the DB (which also
    // deletes the blob from the media store). A failed blob delete
    // doesn't reverse the tombstone — the user has already committed
    // to the destruction and a stranded file is preferable to a
    // visible-but-marked-purged case.
    const r = await localCases.purgeImported(id, mediaKey);
    if (r.ok) {
      mirror("cases.purgeImported", dbPurgeImported(id, mediaKey, currentMirrorEmail()));
    }
    return r;
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
    const out = await localFavs.toggle(email, id, current);
    if (out.result.ok) mirror("favs.toggle", dbSetFavs(email ?? null, out.next));
    return out;
  },
};
