// Tests for `useAdminActions` — the admin-action factory lifted out
// of App.tsx in May-2026. Three contracts:
//
//   1. `onPatch(id, patch)` builds an inverse from the current case
//      state and shows a toast with an undo handle that restores it.
//   2. `onBulkPatch(ids, patch)` does the same per id, skipping any
//      id that isn't in the catalog (no inverse to build).
//   3. `onBulkSoftDelete(ids)` routes each id by ownership: owned
//      cases through userCases.remove, seed cases through an
//      override-based deletedAt tombstone.
//
// The hook is testable in isolation now — those flows used to be
// 140 LOC of inline closures inside App.tsx's JSX.

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAdminActions } from "@/hooks/useAdminActions";
import { caseFactory, adminFactory } from "./fixtures";
// CaseRecord type is imported above with the stubs declaration.

// Using `vi.fn()` without an explicit signature, TS infers
// `Mock<Procedure | Constructable>` which doesn't match our hook's
// strict `(c: CaseRecord) => Promise<boolean>` props. Annotate
// each stub with the exact shape it stands in for.
import type { CaseRecord } from "@/lib/types";

interface Stubs {
  setOverride: ReturnType<
    typeof vi.fn<(id: string, patch: Partial<CaseRecord>) => Promise<boolean>>
  >;
  showToast: ReturnType<
    typeof vi.fn<(message: string, options?: { undo?: () => Promise<unknown> | unknown }) => void>
  >;
  userCasesRemove: ReturnType<typeof vi.fn<(c: CaseRecord) => Promise<boolean>>>;
  userCasesRestore: ReturnType<typeof vi.fn<(c: CaseRecord) => Promise<boolean>>>;
}
let stubs: Stubs;

beforeEach(() => {
  stubs = {
    setOverride: vi.fn<(id: string, patch: Partial<CaseRecord>) => Promise<boolean>>(
      async () => true,
    ),
    showToast:
      vi.fn<(message: string, options?: { undo?: () => Promise<unknown> | unknown }) => void>(),
    userCasesRemove: vi.fn<(c: CaseRecord) => Promise<boolean>>(async () => true),
    userCasesRestore: vi.fn<(c: CaseRecord) => Promise<boolean>>(async () => true),
  };
});

function makeHookDeps(opts: {
  allCases?: Parameters<typeof useAdminActions>[0]["allCases"];
  liveUserCases?: Parameters<typeof useAdminActions>[0]["userCases"]["live"];
  trashedUserCases?: Parameters<typeof useAdminActions>[0]["userCases"]["trashed"];
}) {
  return {
    allCases: opts.allCases ?? [],
    userCases: {
      live: opts.liveUserCases ?? [],
      trashed: opts.trashedUserCases ?? [],
      remove: stubs.userCasesRemove,
      restore: stubs.userCasesRestore,
    },
    setOverride: stubs.setOverride,
    showToast: stubs.showToast,
    user: adminFactory({ email: "admin@hosp.cl" }),
  };
}

describe("useAdminActions — onPatch", () => {
  it("captures an inverse from the case state and offers undo", async () => {
    const original = caseFactory({ id: "c-1", category: "lung", reviewed: false });
    const { result } = renderHook(() => useAdminActions(makeHookDeps({ allCases: [original] })));
    await result.current.onPatch("c-1", { category: "cardiac" });
    // setOverride was called with the forward patch.
    expect(stubs.setOverride).toHaveBeenCalledWith("c-1", { category: "cardiac" });
    // Toast fired with a category-specific message + undo handle.
    expect(stubs.showToast).toHaveBeenCalledWith(
      "Categoría actualizada",
      expect.objectContaining({ undo: expect.any(Function) }),
    );
    // Invoking undo restores the original category via setOverride.
    const toastCall = stubs.showToast.mock.calls[0]!;
    const opts = toastCall[1] as { undo: () => Promise<unknown> };
    await opts.undo();
    expect(stubs.setOverride).toHaveBeenLastCalledWith("c-1", { category: "lung" });
  });

  it("picks the toast message based on the patch shape", async () => {
    const c = caseFactory({ id: "c-1", section: "atlas" });
    const { result } = renderHook(() => useAdminActions(makeHookDeps({ allCases: [c] })));
    await result.current.onPatch("c-1", { section: "ecg" });
    expect(stubs.showToast.mock.calls[0]![0]).toBe("Sección actualizada");
    stubs.showToast.mockClear();
    await result.current.onPatch("c-1", { reviewed: true });
    expect(stubs.showToast.mock.calls[0]![0]).toBe("Marcado revisado");
    stubs.showToast.mockClear();
    await result.current.onPatch("c-1", { reviewed: false });
    expect(stubs.showToast.mock.calls[0]![0]).toBe("Sin marca de revisado");
  });

  it("skips the undo affordance when the case isn't in the catalog", async () => {
    const { result } = renderHook(() => useAdminActions(makeHookDeps({ allCases: [] })));
    await result.current.onPatch("c-missing", { category: "cardiac" });
    expect(stubs.showToast).toHaveBeenCalledWith("Categoría actualizada", undefined);
  });

  it("does NOT toast when setOverride fails", async () => {
    stubs.setOverride.mockResolvedValueOnce(false);
    const c = caseFactory({ id: "c-1" });
    const { result } = renderHook(() => useAdminActions(makeHookDeps({ allCases: [c] })));
    await result.current.onPatch("c-1", { category: "cardiac" });
    expect(stubs.showToast).not.toHaveBeenCalled();
  });
});

describe("useAdminActions — onBulkPatch", () => {
  it("applies the patch to every id and shows a count summary", async () => {
    const cases = [
      caseFactory({ id: "c-1", category: "lung" }),
      caseFactory({ id: "c-2", category: "cardiac" }),
      caseFactory({ id: "c-3", category: "abdominal" }),
    ];
    const { result } = renderHook(() => useAdminActions(makeHookDeps({ allCases: cases })));
    await result.current.onBulkPatch(["c-1", "c-2", "c-3"], { reviewed: true });
    expect(stubs.setOverride).toHaveBeenCalledTimes(3);
    expect(stubs.showToast.mock.calls[0]![0]).toBe("Revisado: 3 casos actualizados");
  });

  it("undo restores each case's original value for the patched key", async () => {
    const cases = [
      caseFactory({ id: "c-1", category: "lung" }),
      caseFactory({ id: "c-2", category: "cardiac" }),
    ];
    const { result } = renderHook(() => useAdminActions(makeHookDeps({ allCases: cases })));
    await result.current.onBulkPatch(["c-1", "c-2"], { category: "ms" });
    const opts = stubs.showToast.mock.calls[0]![1] as { undo: () => Promise<unknown> };
    stubs.setOverride.mockClear();
    await opts.undo();
    expect(stubs.setOverride).toHaveBeenCalledWith("c-1", { category: "lung" });
    expect(stubs.setOverride).toHaveBeenCalledWith("c-2", { category: "cardiac" });
  });

  it("toasts a failure message when every setOverride returns false", async () => {
    stubs.setOverride.mockResolvedValue(false);
    const cases = [caseFactory({ id: "c-1" })];
    const { result } = renderHook(() => useAdminActions(makeHookDeps({ allCases: cases })));
    await result.current.onBulkPatch(["c-1"], { category: "ms" });
    expect(stubs.showToast).toHaveBeenCalledWith("No se pudo aplicar el cambio");
  });
});

describe("useAdminActions — onBulkSoftDelete", () => {
  it("routes user-owned cases through userCases.remove", async () => {
    const owned = caseFactory({ id: "owned-1" });
    const seed = caseFactory({ id: "seed-1" });
    const { result } = renderHook(() =>
      useAdminActions(makeHookDeps({ allCases: [owned, seed], liveUserCases: [owned] })),
    );
    await result.current.onBulkSoftDelete(["owned-1", "seed-1"]);
    expect(stubs.userCasesRemove).toHaveBeenCalledTimes(1);
    expect(stubs.userCasesRemove).toHaveBeenCalledWith(owned);
    // Seed case goes through setOverride with deletedAt + deletedBy.
    expect(stubs.setOverride).toHaveBeenCalledWith(
      "seed-1",
      expect.objectContaining({ deletedAt: expect.any(String), deletedBy: "admin@hosp.cl" }),
    );
  });

  it("undo restores both kinds: userCases.restore for owned, deletedAt: undefined for seed", async () => {
    const owned = caseFactory({ id: "owned-1" });
    const seed = caseFactory({ id: "seed-1" });
    const { result } = renderHook(() =>
      useAdminActions(
        makeHookDeps({
          allCases: [owned, seed],
          liveUserCases: [owned],
          trashedUserCases: [owned], // appears in trash after delete
        }),
      ),
    );
    await result.current.onBulkSoftDelete(["owned-1", "seed-1"]);
    const opts = stubs.showToast.mock.calls[0]![1] as { undo: () => Promise<unknown> };
    stubs.setOverride.mockClear();
    stubs.userCasesRestore.mockClear();
    await opts.undo();
    expect(stubs.userCasesRestore).toHaveBeenCalledWith(owned);
    expect(stubs.setOverride).toHaveBeenCalledWith("seed-1", {
      deletedAt: undefined,
      deletedBy: undefined,
    });
  });

  it("toasts a failure message when nothing got deleted", async () => {
    stubs.setOverride.mockResolvedValue(false);
    stubs.userCasesRemove.mockResolvedValue(false);
    const seed = caseFactory({ id: "seed-1" });
    const { result } = renderHook(() => useAdminActions(makeHookDeps({ allCases: [seed] })));
    await result.current.onBulkSoftDelete(["seed-1"]);
    expect(stubs.showToast).toHaveBeenCalledWith("No se pudo mover a papelera");
  });
});
