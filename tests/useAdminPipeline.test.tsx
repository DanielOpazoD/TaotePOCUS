// Tests for `useAdminPipeline` — the destructive-flow state machine
// (soft-delete + permanent-delete + restore). The hook does not
// render UI; the parent owns the `<ConfirmDialog>` bindings. So all
// tests exercise the transitions + the side-effect calls directly.
//
// Mocks:
//   - `@/lib/repo` so confirmPurge calls a vi.fn() instead of the
//     real repo (which would hit the Server Action).
//   - `@/lib/media-url` so the blob-key extraction is deterministic.

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/hooks/useLanguage";

// The action result mirrors `WriteResult` from `lib/store.ts`. We
// type the mock explicitly so `mockResolvedValueOnce` can return
// either branch; TS would otherwise narrow to the first call's
// shape and reject the failure-case test below.
type ActionRes = { ok: true } | { ok: false; reason: string };
const purgeImported = vi.fn<(id: string, key: string | null) => Promise<ActionRes>>();

vi.mock("@/lib/repo", () => ({
  repo: {
    cases: { purgeImported: (id: string, key: string | null) => purgeImported(id, key) },
  },
}));

vi.mock("@/lib/media-url", () => ({
  mediaKeyFromSrc: (src?: string) => (src ? `key-for:${src}` : null),
}));

import { useAdminPipeline } from "@/hooks/useAdminPipeline";
import type { CaseRecord } from "@/lib/types";
import { adminFactory, caseFactory, resetIdCounter } from "./fixtures";

const userOwned = caseFactory({ id: "u_admin", title: "Mine" });
const seedCase = caseFactory({ id: "tw-seed", title: "Imported" });

function setup({ openCaseId = null as string | null } = {}) {
  // Typed mocks so `mock.calls` destructure to the right shape.
  // Without the explicit signature, vi.fn infers `() => boolean`
  // and the call-tuple becomes empty.
  const setOverride = vi.fn<(id: string, patch: Partial<CaseRecord>) => Promise<boolean>>();
  setOverride.mockResolvedValue(true);
  const remove = vi.fn<(c: CaseRecord) => Promise<boolean>>();
  remove.mockResolvedValue(true);
  const restore = vi.fn<(c: CaseRecord) => Promise<boolean>>();
  restore.mockResolvedValue(true);
  // `showToast` mirrors the full ShowToast shape: message + optional
  // options carrying an `undo` callback. The undo flows assert on
  // `mock.calls[0][1]?.undo` to verify the inverse action wires up.
  const showToast =
    vi.fn<(msg: string, opts?: { undo?: () => unknown; undoLabel?: string }) => void>();
  const closeOpenCase = vi.fn<() => void>();
  const userCases = { live: [userOwned], remove, restore };
  const user = adminFactory();

  // `useAdminPipeline` calls `useLanguage()` for the toast copy +
  // `getCaseTitle(c, lang)` resolution — wrap the hook in a
  // LanguageProvider so the context is available. Default to `es`
  // to match the assertions below ("papelera", "Caso restaurado").
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LanguageProvider initialLang="es">{children}</LanguageProvider>
  );

  const { result } = renderHook(
    () =>
      useAdminPipeline({
        user,
        userCases,
        setOverride,
        showToast,
        openCaseId,
        closeOpenCase,
      }),
    { wrapper },
  );

  return { result, setOverride, remove, restore, showToast, closeOpenCase };
}

beforeEach(() => {
  resetIdCounter();
  purgeImported.mockClear();
  purgeImported.mockResolvedValue({ ok: true });
});

describe("useAdminPipeline · soft-delete", () => {
  it("requestDelete pins the pending case; cancelDelete clears it", () => {
    const { result } = setup();
    act(() => result.current.requestDelete(seedCase));
    expect(result.current.pendingDelete?.id).toBe("tw-seed");
    act(() => result.current.cancelDelete());
    expect(result.current.pendingDelete).toBeNull();
  });

  it("confirmDelete on a user-owned case calls userCases.remove (not setOverride)", async () => {
    // User-owned cases live as real rows; deleting them is a CRUD op.
    // Seed/imported cases are read-only at the source — deleting one
    // means writing a `deletedAt` override. The pipeline picks the
    // right path based on whether the id is in `userCases.live`.
    const { result, setOverride, remove } = setup();
    act(() => result.current.requestDelete(userOwned));
    await act(async () => {
      await result.current.confirmDelete();
    });
    expect(remove).toHaveBeenCalledWith(userOwned);
    expect(setOverride).not.toHaveBeenCalled();
    expect(result.current.pendingDelete).toBeNull();
  });

  it("confirmDelete on a seed case writes a deletedAt override", async () => {
    const { result, setOverride, showToast, remove } = setup();
    act(() => result.current.requestDelete(seedCase));
    await act(async () => {
      await result.current.confirmDelete();
    });
    expect(remove).not.toHaveBeenCalled();
    expect(setOverride).toHaveBeenCalledTimes(1);
    const call = setOverride.mock.calls[0];
    if (!call) throw new Error("setOverride was never called");
    const [id, patch] = call;
    expect(id).toBe("tw-seed");
    expect(patch).toMatchObject({ deletedBy: "admin@taote.pocus" });
    expect(typeof patch.deletedAt).toBe("string");
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("papelera"),
      expect.objectContaining({ undo: expect.any(Function) }),
    );
  });

  it("confirmDelete is a no-op when nothing is pending", async () => {
    const { result, setOverride, remove } = setup();
    await act(async () => {
      await result.current.confirmDelete();
    });
    expect(remove).not.toHaveBeenCalled();
    expect(setOverride).not.toHaveBeenCalled();
  });

  it("undo toast on a seed soft-delete clears deletedAt + deletedBy", async () => {
    const { result, setOverride, showToast } = setup();
    act(() => result.current.requestDelete(seedCase));
    await act(async () => {
      await result.current.confirmDelete();
    });
    // The soft-delete write happened; now invoke the undo callback
    // the toast carried and verify it issues the inverse patch.
    const toastCall = showToast.mock.calls[0];
    if (!toastCall) throw new Error("showToast was never called");
    const [, opts] = toastCall;
    expect(opts?.undo).toBeTypeOf("function");
    setOverride.mockClear();
    await act(async () => {
      await opts?.undo?.();
    });
    expect(setOverride).toHaveBeenCalledWith("tw-seed", {
      deletedAt: undefined,
      deletedBy: undefined,
    });
  });

  it("undo toast on a user-owned soft-delete calls userCases.restore", async () => {
    const { result, restore, showToast } = setup();
    act(() => result.current.requestDelete(userOwned));
    await act(async () => {
      await result.current.confirmDelete();
    });
    const toastCall = showToast.mock.calls[0];
    if (!toastCall) throw new Error("showToast was never called");
    const [, opts] = toastCall;
    expect(opts?.undo).toBeTypeOf("function");
    restore.mockClear();
    await act(async () => {
      await opts?.undo?.();
    });
    expect(restore).toHaveBeenCalledWith(userOwned);
  });
});

describe("useAdminPipeline · permanent delete", () => {
  it("confirmPurge calls repo.cases.purgeImported with the resolved media key", async () => {
    const caseWithMedia = caseFactory({
      id: "tw-x",
      media: { kind: "image", src: "https://example.com/a.png" },
    });
    const { result, showToast } = setup();
    act(() => result.current.requestPurge(caseWithMedia));
    await act(async () => {
      await result.current.confirmPurge();
    });
    expect(purgeImported).toHaveBeenCalledWith("tw-x", "key-for:https://example.com/a.png");
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("eliminado permanentemente"));
    expect(result.current.pendingPurge).toBeNull();
  });

  it("confirmPurge passes null mediaKey for cases without media", async () => {
    const synthetic = caseFactory({ id: "tw-syn", media: undefined });
    const { result } = setup();
    act(() => result.current.requestPurge(synthetic));
    await act(async () => {
      await result.current.confirmPurge();
    });
    expect(purgeImported).toHaveBeenCalledWith("tw-syn", null);
  });

  it("closes the open modal first when the purged case is being viewed", async () => {
    // Toast lives in the layout-level toast region; if the modal stays
    // open it covers the toast so the admin doesn't see the success.
    const target = caseFactory({ id: "tw-open" });
    const { result, closeOpenCase } = setup({ openCaseId: "tw-open" });
    act(() => result.current.requestPurge(target));
    await act(async () => {
      await result.current.confirmPurge();
    });
    expect(closeOpenCase).toHaveBeenCalledTimes(1);
  });

  it("does NOT close the modal when a different case is open", async () => {
    const target = caseFactory({ id: "tw-other" });
    const { result, closeOpenCase } = setup({ openCaseId: "tw-different" });
    act(() => result.current.requestPurge(target));
    await act(async () => {
      await result.current.confirmPurge();
    });
    expect(closeOpenCase).not.toHaveBeenCalled();
  });

  it("surfaces a failure toast when the purge action returns not-ok", async () => {
    purgeImported.mockResolvedValueOnce({ ok: false, reason: "unknown" });
    const target = caseFactory({ id: "tw-fail" });
    const { result, showToast } = setup();
    act(() => result.current.requestPurge(target));
    await act(async () => {
      await result.current.confirmPurge();
    });
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("No se pudo eliminar"));
  });
});

describe("useAdminPipeline · restore", () => {
  it("clears the deletedAt + deletedBy override fields", async () => {
    const trashed = caseFactory({
      id: "tw-trashed",
      deletedAt: "2026-01-01T00:00:00Z",
      deletedBy: "admin",
    });
    const { result, setOverride, showToast } = setup();
    await act(async () => {
      await result.current.restoreImport(trashed);
    });
    expect(setOverride).toHaveBeenCalledWith("tw-trashed", {
      deletedAt: undefined,
      deletedBy: undefined,
    });
    expect(showToast).toHaveBeenCalledWith("Caso restaurado");
  });
});
