// Dispatch-boundary tests for `lib/repo.ts` (Block N′). The repo
// module picks one of three backends at module-load based on env
// flags; the audit flagged that the picker had no test, so a
// regression in the boot-time selection was invisible.
//
// We exercise three branches:
//
//   1. Default — no env flags → the local backends answer.
//   2. NEXT_PUBLIC_USE_DB=1 → the Netlify dual-write wrappers answer.
//   3. (Firebase branch is skipped — it does an async dynamic import
//       that requires a configured project; covered by the
//       IS_FIREBASE_ENABLED ignore range in coverage.)
//
// `vi.resetModules()` between tests forces re-import of `lib/repo.ts`
// so each branch is observed against a fresh module state. Mocks for
// the backends keep the test self-contained (no real Postgres).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Backend stubs ─────────────────────────────────────────────────
// Each backend is a vi.fn-collection so we can later assert which
// backend the dispatch routed a call to.

vi.mock("@/lib/repo/local-cases", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/repo/local-cases")>("@/lib/repo/local-cases");
  return {
    ...actual,
    localCases: {
      ...actual.localCases,
      __backend: "local",
      listUserRaw: vi.fn(async () => [{ from: "local" }]),
    },
  };
});

vi.mock("@/lib/repo/dual-write", () => ({
  dualWriteCases: {
    __backend: "dual",
    listSeed: vi.fn(async () => []),
    listUserRaw: vi.fn(async () => [{ from: "dual" }]),
    listUser: vi.fn(),
    listTrashed: vi.fn(),
    listAll: vi.fn(),
    listAllPaged: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
    purge: vi.fn(),
    listOverrides: vi.fn(),
    setOverride: vi.fn(),
    clearOverride: vi.fn(),
    purgeImported: vi.fn(),
  },
  dualWriteFavs: {
    __backend: "dual",
    list: vi.fn(),
    toggle: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetModules();
  delete process.env.NEXT_PUBLIC_USE_DB;
  delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_USE_DB;
  vi.restoreAllMocks();
});

describe("repo dispatch — backend selection at module load", () => {
  it("with NO env flags → routes cases through localCases", async () => {
    // env.ts reads at module-load time; we have to re-import after
    // mutating env.
    const { repo } = await import("@/lib/repo");
    const result = await repo.cases.listUserRaw();
    expect(result).toEqual([{ from: "local" }]);
  });

  it("with NEXT_PUBLIC_USE_DB=1 → routes cases through dualWriteCases", async () => {
    process.env.NEXT_PUBLIC_USE_DB = "1";
    const { repo } = await import("@/lib/repo");
    const result = await repo.cases.listUserRaw();
    expect(result).toEqual([{ from: "dual" }]);
  });

  it("with NEXT_PUBLIC_USE_DB=0 → routes through localCases (flag is strict '1')", async () => {
    process.env.NEXT_PUBLIC_USE_DB = "0";
    const { repo } = await import("@/lib/repo");
    const result = await repo.cases.listUserRaw();
    expect(result).toEqual([{ from: "local" }]);
  });

  it("with NEXT_PUBLIC_USE_DB='true' → routes through localCases (flag is strict '1')", async () => {
    // Defensive: the flag accepts only the literal "1" — a lazy
    // operator setting `true` should NOT silently flip backends.
    process.env.NEXT_PUBLIC_USE_DB = "true";
    const { repo } = await import("@/lib/repo");
    const result = await repo.cases.listUserRaw();
    expect(result).toEqual([{ from: "local" }]);
  });

  it("favs follow the cases backend (both pick dual when DB flag is set)", async () => {
    process.env.NEXT_PUBLIC_USE_DB = "1";
    const { repo } = await import("@/lib/repo");
    // The favs export forwards to whatever backend was picked. We
    // wired the dual stub's `list` as a vi.fn we can assert against.
    const dual = await import("@/lib/repo/dual-write");
    await repo.favs.list("a@x.com");
    expect(dual.dualWriteFavs.list).toHaveBeenCalledWith("a@x.com");
  });

  it("listOverridesCached always reads localStorage directly (no async dispatch)", async () => {
    // This is the synchronous escape hatch the repo facade exposes
    // for first-render hydration — it must NOT route through the
    // dispatched _cases backend (which would be async). Test by
    // setting localStorage and reading the cached map back.
    process.env.NEXT_PUBLIC_USE_DB = "1"; // even with DB on…
    const { repo } = await import("@/lib/repo");
    localStorage.setItem("pocus_case_overrides", JSON.stringify({ "tw-1": { category: "lung" } }));
    const cached = repo.cases.listOverridesCached();
    expect(cached).toEqual({ "tw-1": { category: "lung" } });
    localStorage.clear();
  });
});
