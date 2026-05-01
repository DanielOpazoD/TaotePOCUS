// localStorage-backed implementation of the cases repo. Pulled out
// of `lib/repo.ts` so the dual-write wrapper can import it without
// creating a circular dependency through the dispatch module.
//
// The shape is identical to what the Firebase backend exposes
// (`lib/firebase-cases.ts`) — both must satisfy the same `CasesRepo`
// type so the dispatch in `lib/repo.ts` can swap them at boot.

import { Store, type WriteResult } from "../store";
import { loadSeedCases } from "../seed-cases";
import { log } from "../log";
import type { CaseRecord } from "../types";
import type { Cursor, ListPagedOptions, ListPagedResult } from "../repo-types";

/** Predicate: a case has been soft-deleted. Used by listUser/listTrashed. */
export function isDeleted(c: CaseRecord): boolean {
  return Boolean(c.deletedAt);
}

/**
 * Cursor encoding for the local backend: a numeric string. The string
 * shape is intentionally opaque — callers should never parse it. When
 * the Firebase backend lands, the encoding becomes a base64-encoded
 * document snapshot ID and the contract is unchanged.
 */
export function encodeCursor(index: number): Cursor {
  return String(index);
}

export function decodeCursor(cursor: Cursor | undefined): number {
  if (cursor == null || cursor === "") return 0;
  const n = Number(cursor);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export const localCases = {
  async listSeed(): Promise<CaseRecord[]> {
    // Triggers the imported-cases code-split chunk on first call,
    // caches in-memory afterward. See `lib/seed-cases.ts`.
    return loadSeedCases();
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
    // Merge the inbound patch INTO the existing override rather than
    // replacing the whole entry. This is what the public docs always
    // promised ("partial override") and what every consumer
    // (reclassify, focus editor, soft-delete, restore) implicitly
    // assumed — but the prior body did a wholesale replace, silently
    // dropping any fields the caller didn't repeat. Reclassifying a
    // case that already had a focus tweak used to wipe the focus.
    //
    // Semantics inside the merged object:
    //   - `value: <something>` → set / update that key on the override.
    //   - `value: undefined`   → REMOVE that key from the override.
    //     This is how callers signal "fall back to the source value
    //     for this field" (used by `restoreImport` to clear
    //     `deletedAt`/`deletedBy`).
    //   - empty merged result  → drop the entry entirely so the case
    //     reads as un-overridden again.
    const existing = all[id] ?? {};
    const merged: Record<string, unknown> = { ...existing };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete merged[k];
      else merged[k] = v;
    }
    if (Object.keys(merged).length === 0) {
      delete all[id];
    } else {
      all[id] = merged as Partial<CaseRecord>;
    }
    log.info("Case override saved", { area: "cases", id, fields: Object.keys(patch) });
    return Store.setCaseOverrides(all);
  },
  async clearOverride(id: string): Promise<WriteResult> {
    const all = Store.getCaseOverrides();
    delete all[id];
    log.info("Case override cleared", { area: "cases", id });
    return Store.setCaseOverrides(all);
  },
  /**
   * Permanent-delete a seed/imported case. Replaces the override with
   * a `{ purged: true }` tombstone so the merge layer keeps filtering
   * it out forever — even after a re-import of `lib/imported-cases.ts`.
   *
   * `_mediaKey` is unused in the local backend (the blob store can't
   * be reached from localStorage) but accepted for API parity with
   * `dualWriteCases.purgeImported`, which forwards it to the Server
   * Action so the file is deleted from the store too. Keeping the
   * signatures aligned means callers don't branch on backend.
   *
   * Mirrors `dbPurgeImported` in `app/actions/db.ts`.
   */
  async purgeImported(id: string, _mediaKey: string | null): Promise<WriteResult> {
    const all = Store.getCaseOverrides();
    all[id] = { purged: true };
    log.info("Imported case purged", { area: "cases", id });
    return Store.setCaseOverrides(all);
  },
};

/** The shape every cases backend (local + dual-write + firebase) must satisfy. */
export type CasesRepo = typeof localCases;
