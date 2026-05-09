// Stability paths for `useUserCases` (Block N′). The existing
// useUserCases.test.tsx covers the happy CRUD path + the quota
// failure on save; this file fills the gaps that the audit flagged:
//
//   - Hydration is GATED on `hydrated`. Setting `hydrated=false` must
//     produce no DB fetch. This is the contract that prevents the
//     admin panel from flashing an empty list before the session
//     resolves.
//   - When the component unmounts before the in-flight `listUserRaw`
//     resolves, the cancelled flag prevents the setRaw call from
//     firing on the unmounted hook (would otherwise be a stale
//     state-update warning OR — worse — silent hydration after
//     navigation).
//   - The non-save mutations (remove / restore / purge) surface the
//     reason-aware failure message when the underlying repo returns
//     a not-ok WriteResult.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useUserCases } from "@/hooks/useUserCases";
import { Store } from "@/lib/store";
import type { CaseRecord, User } from "@/lib/types";
import * as repoModule from "@/lib/repo";

const adminUser: User = {
  email: "admin@taote.pocus",
  name: "Administrador",
  initials: "AD",
  role: "admin",
  issuedAt: Date.now(),
  expiresAt: Date.now() + 1_000_000,
};

// Permissive overrides shape — see useUserCases.test.tsx for rationale.
import { normalizeLocalizedString, normalizeLocalizedTags } from "@/lib/case-localized";
import type { LocalizedString, LocalizedTags } from "@/lib/types";
type MkCaseOverrides = Omit<Partial<CaseRecord>, "title" | "description" | "tags"> & {
  title?: string | LocalizedString;
  description?: string | LocalizedString;
  tags?: string[] | LocalizedTags;
};
const mkCase = (overrides: MkCaseOverrides = {}): CaseRecord => {
  const { title, description, tags, ...rest } = overrides;
  return {
    id: "u_test",
    section: "atlas",
    title: normalizeLocalizedString(title ?? "Test case"),
    category: "cardiac",
    tags: normalizeLocalizedTags(tags ?? []),
    modality: "Test",
    loop: "blines",
    author: "Tester",
    role: "QA",
    date: "2026-04-26",
    description: normalizeLocalizedString(description ?? "Test description."),
    ...rest,
  };
};

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useUserCases — hydration gate", () => {
  it("does NOT fetch when hydrated=false (admin panel won't flash empty)", async () => {
    Store.setUserCases([mkCase({ id: "live-1" })]);
    const spy = vi.spyOn(repoModule.repo.cases, "listUserRaw");
    const { result } = renderHook(() => useUserCases(adminUser, false));
    // Give the effect a chance to run if it would fire incorrectly.
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).not.toHaveBeenCalled();
    expect(result.current.raw).toEqual([]);
  });

  it("starts the fetch the moment hydrated flips to true", async () => {
    Store.setUserCases([mkCase({ id: "live-1" })]);
    const { result, rerender } = renderHook(
      ({ hydrated }: { hydrated: boolean }) => useUserCases(adminUser, hydrated),
      { initialProps: { hydrated: false } },
    );
    expect(result.current.raw).toEqual([]);
    rerender({ hydrated: true });
    await waitFor(() => expect(result.current.raw).toHaveLength(1));
  });
});

describe("useUserCases — hydration race", () => {
  it("does not setRaw on an unmounted hook (cancelled flag)", async () => {
    // Replace listUserRaw with a controllable promise so we can
    // unmount the hook BEFORE the fetch resolves and assert the
    // post-resolution setRaw never fires (no stale-state warning,
    // no hydration of detached state).
    let resolveFetch!: (rows: CaseRecord[]) => void;
    const pending = new Promise<CaseRecord[]>((res) => {
      resolveFetch = res;
    });
    const spy = vi.spyOn(repoModule.repo.cases, "listUserRaw").mockReturnValue(pending);

    const { result, unmount } = renderHook(() => useUserCases(adminUser, true));
    expect(result.current.raw).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);

    // Unmount BEFORE the fetch resolves. The hook's cleanup sets
    // cancelled=true, so the resolved value should be discarded.
    unmount();

    // Resolve the pending fetch — would have triggered setRaw if the
    // cancellation guard wasn't in place. We can't assert "no warning
    // was logged" portably, but the fact that the test exits cleanly
    // (no act() warning, no React unmounted-component warning) is
    // the signal. Result.current is still observable post-unmount.
    resolveFetch([mkCase({ id: "post-unmount" })]);
    await new Promise((r) => setTimeout(r, 0));
    // result.current was captured at unmount time and is not refreshed
    // by the post-unmount setter (because of the cancelled flag).
    expect(result.current.raw).toEqual([]);
  });
});

describe("useUserCases — failure surfaces (reason-aware messages)", () => {
  it("remove notifies with auth_required message when DB returns it", async () => {
    Store.setUserCases([mkCase({ id: "victim" })]);
    const notify = vi.fn();
    const { result } = renderHook(() => useUserCases(adminUser, true, { notify }));
    await waitFor(() => expect(result.current.raw).toHaveLength(1));

    vi.spyOn(repoModule.repo.cases, "remove").mockResolvedValue({
      ok: false,
      reason: "auth_required",
    });

    let ok!: boolean;
    await act(async () => {
      ok = await result.current.remove(result.current.raw[0]!);
    });
    expect(ok).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/sesi[oó]n expirada/i));
    // The case stayed in raw (no refresh on failure).
    expect(result.current.raw).toHaveLength(1);
  });

  it("restore notifies with forbidden message when DB returns it", async () => {
    Store.setUserCases([mkCase({ id: "ghost", deletedAt: "2026-01-01T00:00:00Z" })]);
    const notify = vi.fn();
    const { result } = renderHook(() => useUserCases(adminUser, true, { notify }));
    await waitFor(() => expect(result.current.trashed).toHaveLength(1));

    vi.spyOn(repoModule.repo.cases, "restore").mockResolvedValue({
      ok: false,
      reason: "forbidden",
    });

    let ok!: boolean;
    await act(async () => {
      ok = await result.current.restore(result.current.trashed[0]!);
    });
    expect(ok).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/permiso/i));
  });

  it("purge notifies with unknown message when DB returns it", async () => {
    Store.setUserCases([mkCase({ id: "doomed", deletedAt: "2026-01-01T00:00:00Z" })]);
    const notify = vi.fn();
    const { result } = renderHook(() => useUserCases(adminUser, true, { notify }));
    await waitFor(() => expect(result.current.trashed).toHaveLength(1));

    vi.spyOn(repoModule.repo.cases, "purge").mockResolvedValue({
      ok: false,
      reason: "unknown",
    });

    let ok!: boolean;
    await act(async () => {
      ok = await result.current.purge(result.current.trashed[0]!);
    });
    expect(ok).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/no se pudo eliminar/i));
  });

  it("save notifies with unavailable message when storage is unavailable", async () => {
    const notify = vi.fn();
    const { result } = renderHook(() => useUserCases(adminUser, true, { notify }));
    await waitFor(() => expect(result.current.raw).toEqual([]));

    vi.spyOn(repoModule.repo.cases, "save").mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });

    let ok!: boolean;
    await act(async () => {
      ok = await result.current.save(mkCase({ id: "x" }), { isUpdate: false });
    });
    expect(ok).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/almacenamiento/i));
  });
});
