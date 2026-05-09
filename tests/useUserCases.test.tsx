import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useUserCases } from "@/hooks/useUserCases";
import { Store } from "@/lib/store";
import type { CaseRecord, User } from "@/lib/types";

const adminUser: User = {
  email: "admin@taote.pocus",
  name: "Administrador",
  initials: "AD",
  role: "admin",
  issuedAt: Date.now(),
  expiresAt: Date.now() + 1_000_000,
};

// `Partial<CaseRecord>` would force callers to pass dual-language
// shapes for title / description / tags. Widen here to accept either
// the modern `LocalizedString` / `LocalizedTags` or a legacy plain
// string / array — useful sugar for the dozens of inline test
// fixtures below. Normalized via the helpers from `case-localized`.
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

describe("useUserCases", () => {
  it("hydrates raw, live, and trashed lists from storage", async () => {
    Store.setUserCases([
      mkCase({ id: "live-1", title: "Live" }),
      mkCase({ id: "trash-1", title: "Trash", deletedAt: "2026-01-01T00:00:00Z" }),
    ]);
    const { result } = renderHook(() => useUserCases(adminUser, true));
    await waitFor(() => expect(result.current.raw.length).toBe(2));
    expect(result.current.live.map((c) => c.id)).toEqual(["live-1"]);
    expect(result.current.trashed.map((c) => c.id)).toEqual(["trash-1"]);
  });

  it("save inserts a new case and refreshes state", async () => {
    const { result } = renderHook(() => useUserCases(adminUser, true));
    await waitFor(() => expect(result.current.raw).toEqual([]));
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.save(mkCase({ id: "new" }), { isUpdate: false });
    });
    expect(ok).toBe(true);
    expect(result.current.live).toHaveLength(1);
    expect(result.current.live[0]!.id).toBe("new");
  });

  it("remove soft-deletes (kept in raw, not in live)", async () => {
    Store.setUserCases([mkCase({ id: "victim" })]);
    const { result } = renderHook(() => useUserCases(adminUser, true));
    await waitFor(() => expect(result.current.raw).toHaveLength(1));
    await act(async () => {
      await result.current.remove(result.current.raw[0]!);
    });
    expect(result.current.live).toHaveLength(0);
    expect(result.current.trashed).toHaveLength(1);
    expect(result.current.trashed[0]!.deletedAt).toBeTruthy();
  });

  it("restore brings a soft-deleted case back to live", async () => {
    Store.setUserCases([mkCase({ id: "ghost", deletedAt: "2026-01-01T00:00:00Z" })]);
    const { result } = renderHook(() => useUserCases(adminUser, true));
    await waitFor(() => expect(result.current.trashed).toHaveLength(1));
    await act(async () => {
      await result.current.restore(result.current.trashed[0]!);
    });
    expect(result.current.live).toHaveLength(1);
    expect(result.current.live[0]!.deletedAt).toBeUndefined();
  });

  it("purge hard-deletes from storage", async () => {
    Store.setUserCases([mkCase({ id: "doomed", deletedAt: "2026-01-01T00:00:00Z" })]);
    const { result } = renderHook(() => useUserCases(adminUser, true));
    await waitFor(() => expect(result.current.trashed).toHaveLength(1));
    await act(async () => {
      await result.current.purge(result.current.trashed[0]!);
    });
    expect(result.current.raw).toEqual([]);
  });

  it("notifies with the friendly message on save success", async () => {
    const notify = vi.fn();
    const { result } = renderHook(() => useUserCases(adminUser, true, { notify }));
    await waitFor(() => expect(result.current.raw).toEqual([]));
    await act(async () => {
      await result.current.save(mkCase({ id: "x" }), { isUpdate: false });
    });
    expect(notify).toHaveBeenCalledWith("Caso publicado");
  });

  it("notifies with the quota message when storage refuses", async () => {
    const notify = vi.fn();
    const { result } = renderHook(() => useUserCases(adminUser, true, { notify }));
    await waitFor(() => expect(result.current.raw).toEqual([]));
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      const err = new Error("Quota exceeded");
      (err as { name: string }).name = "QuotaExceededError";
      throw err;
    });
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.save(mkCase({ id: "big" }), { isUpdate: false });
    });
    expect(ok).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/espacio/i));
    spy.mockRestore();
  });
});
