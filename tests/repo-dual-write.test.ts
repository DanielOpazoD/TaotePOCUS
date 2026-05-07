// Behavioral coverage for `lib/repo/dual-write.ts` — the layer that
// decides whether an admin mutation lands in Postgres, in localStorage,
// in both, or in neither, and what the UI sees when each leg fails.
//
// Why this test file exists (auditor verdict): dual-write.ts is the
// most consequential module in the persistence chain — it implements
// the post-ADR-0011 "DB authoritative on writes, DB-first on reads
// with local fallback" contract — and pre-Block-K coverage was 2.22%.
// The contract has four axes the suite exercises:
//
//   - Read happy path (DB returns data → cache it, return it).
//   - Read empty (DB returns [] → fall back to local, do NOT cache
//     empty over a populated local — that's the failure mode that
//     used to nuke localStorage when the flag flipped on a pristine
//     DB).
//   - Read fail (DB throws → log + fall back to local, return local).
//   - Write happy (DB ok → mirror to local, return ok).
//   - Write fail (DB returns not-ok or throws → DO NOT touch local,
//     return the failure verbatim).
//
// We mock `@/app/actions/db` and `@/lib/store` so the tests run
// without a live Postgres or browser localStorage. Each path is
// asserted on both the return value and the side-effect (was the
// local cache touched? what did the action see?).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseRecord } from "@/lib/types";

// ─── Mock the Server Actions module ────────────────────────────────
// `app/actions/db.ts` calls `getDatabase()` at module load and is
// `"use server"` — we never want the real implementation in unit
// tests. Replace every export the dual-write layer touches with a vi.fn
// we can program per-test.
vi.mock("@/app/actions/db", () => ({
  dbListOverrides: vi.fn(),
  dbListUserCases: vi.fn(),
  dbListFavs: vi.fn(),
  dbSetOverride: vi.fn(),
  dbClearOverride: vi.fn(),
  dbPurgeImported: vi.fn(),
  dbSaveUserCase: vi.fn(),
  dbRemoveUserCase: vi.fn(),
  dbRestoreUserCase: vi.fn(),
  dbPurgeUserCase: vi.fn(),
  dbSetFavs: vi.fn(),
}));

// ─── Mock the Store so the local-cache leg is observable ───────────
// Each setter / getter is a vi.fn — we read `mock.calls` to assert
// "was the local cache touched?" and we return canned data from the
// getters to drive the fallback path.
vi.mock("@/lib/store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/store")>("@/lib/store");
  return {
    ...actual,
    Store: {
      getUser: vi.fn(() => null),
      setUser: vi.fn(() => ({ ok: true })),
      clearUser: vi.fn(),
      getFavs: vi.fn(() => []),
      setFavs: vi.fn(() => ({ ok: true })),
      getUserCases: vi.fn(() => []),
      setUserCases: vi.fn(() => ({ ok: true })),
      getCaseOverrides: vi.fn(() => ({})),
      setCaseOverrides: vi.fn(() => ({ ok: true })),
      estimateUsage: vi.fn(() => 0),
    },
  };
});

// Stub the seed loader so listAll / listAllPaged don't try to dynamic-
// import the 6055 LOC corpus during the test run.
vi.mock("@/lib/seed-cases", () => ({
  loadSeedCases: vi.fn(async () => [] as CaseRecord[]),
}));

// Pull the mocked symbols + the system under test AFTER the mocks are
// declared. The order matters: vi.mock runs hoisted, but the imports
// here resolve to the mocked versions only because of that hoist.
import { Store } from "@/lib/store";
import * as db from "@/app/actions/db";
import { dualWriteCases, dualWriteFavs } from "@/lib/repo/dual-write";
import { caseFactory, resetIdCounter } from "./fixtures";

// Convenience cast — every mocked function is a vi.Mock at runtime.
const m = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetIdCounter();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════════
// READS — DB-first with local fallback
// ════════════════════════════════════════════════════════════════════

describe("dualWriteCases — listOverrides (DB-first read)", () => {
  it("returns DB data and refreshes local cache on success", async () => {
    const dbData = { "tw-1": { title: "Edited" } as Partial<CaseRecord> };
    m(db.dbListOverrides).mockResolvedValueOnce(dbData);
    const result = await dualWriteCases.listOverrides();
    expect(result).toEqual(dbData);
    // Local cache was refreshed with the DB payload.
    expect(Store.setCaseOverrides).toHaveBeenCalledWith(dbData);
  });

  it("falls back to local when DB returns an empty map (does NOT overwrite local with empty)", async () => {
    m(db.dbListOverrides).mockResolvedValueOnce({});
    const localData = { "tw-1": { title: "Local edit" } as Partial<CaseRecord> };
    m(Store.getCaseOverrides).mockReturnValueOnce(localData);

    const result = await dualWriteCases.listOverrides();
    expect(result).toEqual(localData);
    // Empty DB result must NOT propagate to the local cache.
    expect(Store.setCaseOverrides).not.toHaveBeenCalled();
  });

  it("falls back to local when the DB action throws (transient outage)", async () => {
    m(db.dbListOverrides).mockRejectedValueOnce(new Error("network blip"));
    const localData = { "tw-1": { title: "Cached" } as Partial<CaseRecord> };
    m(Store.getCaseOverrides).mockReturnValueOnce(localData);

    const result = await dualWriteCases.listOverrides();
    expect(result).toEqual(localData);
    expect(Store.setCaseOverrides).not.toHaveBeenCalled();
  });
});

describe("dualWriteCases — listUser/listTrashed/listAll/listAllPaged", () => {
  const live = caseFactory({ id: "u-live", title: "Live" });
  const trashed = caseFactory({
    id: "u-trash",
    title: "Trashed",
    deletedAt: "2026-05-01T00:00:00.000Z",
  });

  it("listUser returns only non-soft-deleted DB cases and caches the raw set", async () => {
    m(db.dbListUserCases).mockResolvedValueOnce([live, trashed]);
    const result = await dualWriteCases.listUser();
    expect(result).toEqual([live]);
    // The cache stores the RAW list (live + trashed) so listTrashed
    // doesn't have to re-fetch.
    expect(Store.setUserCases).toHaveBeenCalledWith([live, trashed]);
  });

  it("listTrashed returns only soft-deleted DB cases", async () => {
    m(db.dbListUserCases).mockResolvedValueOnce([live, trashed]);
    const result = await dualWriteCases.listTrashed();
    expect(result).toEqual([trashed]);
  });

  it("listUser falls back to local when the DB returns []", async () => {
    m(db.dbListUserCases).mockResolvedValueOnce([]);
    m(Store.getUserCases).mockReturnValueOnce([live]);
    const result = await dualWriteCases.listUser();
    expect(result).toEqual([live]);
    // Empty DB → local cache untouched.
    expect(Store.setUserCases).not.toHaveBeenCalled();
  });

  it("listAll concatenates user-live + seed (seed empty in test)", async () => {
    m(db.dbListUserCases).mockResolvedValueOnce([live, trashed]);
    const result = await dualWriteCases.listAll();
    // Seed mock is empty; trashed is filtered out; only `live` remains.
    expect(result).toEqual([live]);
  });

  it("listAllPaged honors cursor/limit and emits nextCursor when more pages exist", async () => {
    const cases = Array.from({ length: 5 }, (_, i) =>
      caseFactory({ id: `u-${i}`, title: `Case ${i}` }),
    );
    m(db.dbListUserCases).mockResolvedValue(cases);

    const page1 = await dualWriteCases.listAllPaged({ cursor: undefined, limit: 2 });
    expect(page1.items.map((c) => c.id)).toEqual(["u-0", "u-1"]);
    expect(page1.nextCursor).toBe("2");
    expect(page1.total).toBe(5);

    const page2 = await dualWriteCases.listAllPaged({ cursor: "2", limit: 2 });
    expect(page2.items.map((c) => c.id)).toEqual(["u-2", "u-3"]);
    expect(page2.nextCursor).toBe("4");

    const page3 = await dualWriteCases.listAllPaged({ cursor: "4", limit: 2 });
    expect(page3.items.map((c) => c.id)).toEqual(["u-4"]);
    expect(page3.nextCursor).toBeNull();
  });

  it("listAllPaged returns empty page + null cursor when start ≥ total", async () => {
    m(db.dbListUserCases).mockResolvedValue([]);
    const page = await dualWriteCases.listAllPaged({ cursor: "999", limit: 10 });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(page.total).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// WRITES — DB authoritative; local follows on success only
// ════════════════════════════════════════════════════════════════════

describe("dualWriteCases — writes (DB authoritative)", () => {
  const c = caseFactory({ id: "u-w1", title: "Write me" });

  describe("save", () => {
    it("ok DB → mirrors to local and returns ok", async () => {
      m(db.dbSaveUserCase).mockResolvedValueOnce({ ok: true });
      const result = await dualWriteCases.save(c, []);
      expect(result).toEqual({ ok: true });
      // Local cache was updated through localCases.save → Store.setUserCases.
      expect(Store.setUserCases).toHaveBeenCalledTimes(1);
    });

    it("infers isUpdate=true when the case id is already in the current list", async () => {
      m(db.dbSaveUserCase).mockResolvedValueOnce({ ok: true });
      await dualWriteCases.save(c, [c]);
      // 3rd positional arg is `isUpdate`.
      const call = m(db.dbSaveUserCase).mock.calls[0]!;
      expect(call[2]).toBe(true);
    });

    it("infers isUpdate=false when the case id is new", async () => {
      m(db.dbSaveUserCase).mockResolvedValueOnce({ ok: true });
      await dualWriteCases.save(c, []);
      const call = m(db.dbSaveUserCase).mock.calls[0]!;
      expect(call[2]).toBe(false);
    });

    it("DB returns auth_required → local untouched, failure surfaces verbatim", async () => {
      m(db.dbSaveUserCase).mockResolvedValueOnce({ ok: false, reason: "auth_required" });
      const result = await dualWriteCases.save(c, []);
      expect(result).toEqual({ ok: false, reason: "auth_required" });
      expect(Store.setUserCases).not.toHaveBeenCalled();
    });

    it("DB returns forbidden → local untouched, failure surfaces verbatim", async () => {
      m(db.dbSaveUserCase).mockResolvedValueOnce({ ok: false, reason: "forbidden" });
      const result = await dualWriteCases.save(c, []);
      expect(result).toEqual({ ok: false, reason: "forbidden" });
      expect(Store.setUserCases).not.toHaveBeenCalled();
    });

    it("DB throws → returns ok:false unknown, local untouched", async () => {
      m(db.dbSaveUserCase).mockRejectedValueOnce(new Error("boom"));
      const result = await dualWriteCases.save(c, []);
      expect(result).toEqual({ ok: false, reason: "unknown" });
      expect(Store.setUserCases).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("ok DB → soft-delete written to local; passes through actor email", async () => {
      m(db.dbSaveUserCase).mockResolvedValue({ ok: true });
      m(db.dbRemoveUserCase).mockResolvedValueOnce({ ok: true });
      const result = await dualWriteCases.remove("u-w1", [c], "admin@x.com");
      expect(result).toEqual({ ok: true });
      expect(db.dbRemoveUserCase).toHaveBeenCalledWith("u-w1", "admin@x.com");
      expect(Store.setUserCases).toHaveBeenCalled();
    });

    it("falls back to currentMirrorEmail() (Store.getUser) when actor not provided", async () => {
      m(Store.getUser).mockReturnValueOnce({
        email: "from-store@x.com",
      } as ReturnType<typeof Store.getUser>);
      m(db.dbRemoveUserCase).mockResolvedValueOnce({ ok: true });
      await dualWriteCases.remove("u-w1", [c]);
      expect(db.dbRemoveUserCase).toHaveBeenCalledWith("u-w1", "from-store@x.com");
    });

    it("currentMirrorEmail returns null when Store.getUser throws", async () => {
      m(Store.getUser).mockImplementationOnce(() => {
        throw new Error("storage disabled");
      });
      m(db.dbRemoveUserCase).mockResolvedValueOnce({ ok: true });
      await dualWriteCases.remove("u-w1", [c]);
      expect(db.dbRemoveUserCase).toHaveBeenCalledWith("u-w1", null);
    });

    it("DB fails → returns failure, local untouched", async () => {
      m(db.dbRemoveUserCase).mockResolvedValueOnce({ ok: false, reason: "forbidden" });
      const result = await dualWriteCases.remove("u-w1", [c]);
      expect(result).toEqual({ ok: false, reason: "forbidden" });
      expect(Store.setUserCases).not.toHaveBeenCalled();
    });
  });

  describe("restore / purge / setOverride / clearOverride / purgeImported", () => {
    it("restore: ok DB mirrors; failed DB does not", async () => {
      m(db.dbRestoreUserCase).mockResolvedValueOnce({ ok: true });
      await dualWriteCases.restore("u-w1", [c]);
      expect(Store.setUserCases).toHaveBeenCalled();

      vi.clearAllMocks();
      m(db.dbRestoreUserCase).mockResolvedValueOnce({ ok: false, reason: "unknown" });
      const result = await dualWriteCases.restore("u-w1", [c]);
      expect(result.ok).toBe(false);
      expect(Store.setUserCases).not.toHaveBeenCalled();
    });

    it("purge: ok DB mirrors; throwing DB returns unknown", async () => {
      m(db.dbPurgeUserCase).mockResolvedValueOnce({ ok: true });
      await dualWriteCases.purge("u-w1", [c]);
      expect(Store.setUserCases).toHaveBeenCalled();

      vi.clearAllMocks();
      m(db.dbPurgeUserCase).mockRejectedValueOnce(new Error("net"));
      const result = await dualWriteCases.purge("u-w1", [c]);
      expect(result).toEqual({ ok: false, reason: "unknown" });
      expect(Store.setUserCases).not.toHaveBeenCalled();
    });

    it("setOverride: ok DB mirrors via Store.setCaseOverrides", async () => {
      m(db.dbSetOverride).mockResolvedValueOnce({ ok: true });
      const r = await dualWriteCases.setOverride("tw-1", { title: "x" });
      expect(r).toEqual({ ok: true });
      expect(Store.setCaseOverrides).toHaveBeenCalled();
    });

    it("setOverride: DB fails → Store.setCaseOverrides untouched", async () => {
      m(db.dbSetOverride).mockResolvedValueOnce({ ok: false, reason: "auth_required" });
      const r = await dualWriteCases.setOverride("tw-1", { title: "x" });
      expect(r).toEqual({ ok: false, reason: "auth_required" });
      expect(Store.setCaseOverrides).not.toHaveBeenCalled();
    });

    it("clearOverride: ok DB mirrors via Store.setCaseOverrides", async () => {
      m(db.dbClearOverride).mockResolvedValueOnce({ ok: true });
      await dualWriteCases.clearOverride("tw-1");
      expect(Store.setCaseOverrides).toHaveBeenCalled();
    });

    it("purgeImported: forwards mediaKey to the action and tombstones on success", async () => {
      m(db.dbPurgeImported).mockResolvedValueOnce({ ok: true });
      await dualWriteCases.purgeImported("tw-1", "tw-1.mp4");
      const call = m(db.dbPurgeImported).mock.calls[0]!;
      expect(call[0]).toBe("tw-1");
      expect(call[1]).toBe("tw-1.mp4");
      expect(Store.setCaseOverrides).toHaveBeenCalled();
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// FAVORITES — DB-first list + DB-authoritative toggle
// ════════════════════════════════════════════════════════════════════

describe("dualWriteFavs", () => {
  describe("list", () => {
    it("returns DB favs and refreshes local cache", async () => {
      m(db.dbListFavs).mockResolvedValueOnce(["c1", "c2"]);
      const result = await dualWriteFavs.list("a@x.com");
      expect(result).toEqual(["c1", "c2"]);
      expect(Store.setFavs).toHaveBeenCalledWith("a@x.com", ["c1", "c2"]);
    });

    it("falls back to local when DB returns []", async () => {
      m(db.dbListFavs).mockResolvedValueOnce([]);
      m(Store.getFavs).mockReturnValueOnce(["local-c"]);
      const result = await dualWriteFavs.list("a@x.com");
      expect(result).toEqual(["local-c"]);
      expect(Store.setFavs).not.toHaveBeenCalled();
    });

    it("falls back to local when the action throws", async () => {
      m(db.dbListFavs).mockRejectedValueOnce(new Error("net"));
      m(Store.getFavs).mockReturnValueOnce(["cached"]);
      const result = await dualWriteFavs.list(null);
      expect(result).toEqual(["cached"]);
      expect(Store.setFavs).not.toHaveBeenCalled();
    });

    it("treats undefined/null email as the guest bucket", async () => {
      m(db.dbListFavs).mockResolvedValueOnce(["x"]);
      await dualWriteFavs.list();
      expect(db.dbListFavs).toHaveBeenCalledWith(null);
    });
  });

  describe("toggle", () => {
    it("adds to the set and commits both DB and local on success", async () => {
      m(db.dbSetFavs).mockResolvedValueOnce({ ok: true });
      const { result, next } = await dualWriteFavs.toggle("a@x.com", "c2", ["c1"]);
      expect(result).toEqual({ ok: true });
      expect(next).toEqual(["c1", "c2"]);
      // The DB sees the COMPUTED `next`, not the current.
      expect(db.dbSetFavs).toHaveBeenCalledWith("a@x.com", ["c1", "c2"]);
      // Local mirrors only on success.
      expect(Store.setFavs).toHaveBeenCalledWith("a@x.com", ["c1", "c2"]);
    });

    it("removes from the set when the id is already present", async () => {
      m(db.dbSetFavs).mockResolvedValueOnce({ ok: true });
      const { next } = await dualWriteFavs.toggle("a@x.com", "c1", ["c1", "c2"]);
      expect(next).toEqual(["c2"]);
      expect(db.dbSetFavs).toHaveBeenCalledWith("a@x.com", ["c2"]);
    });

    it("DB returns not-ok → local untouched, next reverts to current (no UI flicker)", async () => {
      m(db.dbSetFavs).mockResolvedValueOnce({ ok: false, reason: "auth_required" });
      const current = ["c1"];
      const { result, next } = await dualWriteFavs.toggle("a@x.com", "c2", current);
      expect(result).toEqual({ ok: false, reason: "auth_required" });
      // Returned `next` matches the unchanged current — caller can
      // drop the optimistic update without comparing references.
      expect(next).toEqual(current);
      expect(Store.setFavs).not.toHaveBeenCalled();
    });

    it("DB throws → unknown failure, local untouched, next reverts", async () => {
      m(db.dbSetFavs).mockRejectedValueOnce(new Error("network blip"));
      const current = ["c1"];
      const { result, next } = await dualWriteFavs.toggle("a@x.com", "c2", current);
      expect(result).toEqual({ ok: false, reason: "unknown" });
      expect(next).toEqual(current);
      expect(Store.setFavs).not.toHaveBeenCalled();
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// CONCURRENCY — two writes to the same id should not corrupt local
// ════════════════════════════════════════════════════════════════════

describe("dualWriteCases — concurrency", () => {
  it("two concurrent setOverride calls: both DB-authoritative paths run; local mirrors only on the ok ones", async () => {
    // First call resolves OK; second resolves NOT-OK.
    // The point of the assertion is that the local cache is touched
    // exactly once (for the ok call) — never for the failed one,
    // even if it lands second under a race.
    m(db.dbSetOverride)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: "forbidden" });

    const [a, b] = await Promise.all([
      dualWriteCases.setOverride("tw-1", { title: "A" }),
      dualWriteCases.setOverride("tw-1", { title: "B" }),
    ]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: false, reason: "forbidden" });
    expect(Store.setCaseOverrides).toHaveBeenCalledTimes(1);
  });
});
