// Tests for `useMergedCatalog` — the catalog-derivation hook
// extracted from App.tsx. Pin the merge + filter rules so future
// changes to the override semantics don't silently break the public
// catalog view.
//
// The hook reads from `useSeedCases` for the imported corpus.
// We mock that hook with `vi.mock` so the test is deterministic
// (otherwise we'd need the lazy chunk loader to resolve, which
// requires the dynamic import to fire and the test to wait on it —
// not worth the complexity for pure-derivation tests).

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMergedCatalog } from "@/hooks/useMergedCatalog";
import type { CaseRecord } from "@/lib/types";
import { caseFactory, resetIdCounter } from "./fixtures";

// Test-controlled seed list. Each test resets it via the helper
// below before exercising the hook. Lives at module scope because
// `vi.mock` is hoisted above `beforeEach`.
const seedRef: { current: CaseRecord[] } = { current: [] };

vi.mock("@/hooks/useSeedCases", () => ({
  useSeedCases: () => ({ seed: seedRef.current, loading: false }),
}));

beforeEach(() => {
  resetIdCounter();
  seedRef.current = [];
});

describe("useMergedCatalog", () => {
  it("merges user-uploaded cases with the seed corpus", () => {
    const seedCase = caseFactory({ id: "seed-1", title: "Seed", category: "lung" });
    const userCase = caseFactory({ id: "user-1", title: "User", category: "cardiac" });
    seedRef.current = [seedCase];

    const { result } = renderHook(() =>
      useMergedCatalog({ userCasesLive: [userCase], overrides: {} }),
    );

    expect(result.current.allCases.map((c) => c.id)).toEqual(["user-1", "seed-1"]);
  });

  it("applies overrides from the override map", () => {
    const seedCase = caseFactory({ id: "seed-1", title: "Original", category: "lung" });
    seedRef.current = [seedCase];

    const { result } = renderHook(() =>
      useMergedCatalog({
        userCasesLive: [],
        overrides: { "seed-1": { title: { es: "Patched" } } },
      }),
    );

    expect(result.current.allCases[0]?.title.es).toBe("Patched");
  });

  it("hides soft-deleted cases from `allCases` but keeps them in `trashedImports`", () => {
    const live = caseFactory({ id: "live-1", category: "cardiac" });
    const trashed = caseFactory({
      id: "trashed-1",
      category: "lung",
      deletedAt: "2026-01-01T00:00:00Z",
    });
    seedRef.current = [live, trashed];

    const { result } = renderHook(() => useMergedCatalog({ userCasesLive: [], overrides: {} }));

    expect(result.current.allCases.map((c) => c.id)).toEqual(["live-1"]);
    expect(result.current.trashedImports.map((c) => c.id)).toEqual(["trashed-1"]);
  });

  it("hides purged cases from EVERYWHERE (allCases + trashedImports)", () => {
    // The purged tombstone is the contract that survives a re-import
    // of `lib/imported-cases.ts` — both views must respect it.
    const live = caseFactory({ id: "live-1" });
    const purged = caseFactory({ id: "purged-1" });
    seedRef.current = [live, purged];

    const { result } = renderHook(() =>
      useMergedCatalog({
        userCasesLive: [],
        overrides: { "purged-1": { purged: true } },
      }),
    );

    expect(result.current.allCases.map((c) => c.id)).toEqual(["live-1"]);
    expect(result.current.trashedImports.map((c) => c.id)).toEqual([]);
  });

  it("counts cases per category off the live `allCases` list", () => {
    seedRef.current = [
      caseFactory({ category: "cardiac" }),
      caseFactory({ category: "cardiac" }),
      caseFactory({ category: "lung" }),
      // Soft-deleted shouldn't appear in counts (the editor uses these
      // to gate category deletion — phantom counts would block deletes).
      caseFactory({ category: "lung", deletedAt: "2026-01-01T00:00:00Z" }),
    ];

    const { result } = renderHook(() => useMergedCatalog({ userCasesLive: [], overrides: {} }));

    expect(result.current.categoryCaseCounts).toEqual({ cardiac: 2, lung: 1 });
  });

  it("returns an empty catalog when the seed chunk hasn't arrived yet", () => {
    // First-paint state: useSeedCases returns []. The hook must
    // produce a coherent (empty-but-renderable) result, not throw.
    seedRef.current = [];

    const { result } = renderHook(() => useMergedCatalog({ userCasesLive: [], overrides: {} }));

    expect(result.current.allCases).toEqual([]);
    expect(result.current.trashedImports).toEqual([]);
    expect(result.current.categoryCaseCounts).toEqual({});
  });
});
