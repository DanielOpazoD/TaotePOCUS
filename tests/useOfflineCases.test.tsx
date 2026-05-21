// Unit tests for `useOfflineCases`. The hook delegates the actual
// SW conversation to `lib/offline-cases.ts`; we mock those exports
// so the tests don't depend on a real service worker (jsdom has no
// SW). The behaviours under test:
//
//   - Boot hydrates the saved-id Set from localStorage.
//   - Boot reconcile drops local IDs whose URL isn't in the SW
//     cache snapshot.
//   - save() returns true and updates state on SW success.
//   - save() reports LRU evictions via the notify callback.
//   - remove() returns true and clears the id from state.
//   - toggle() swings to the opposite state.
//
// We do NOT test the SW side here (that's a runtime contract
// validated by browser end-to-end). The mocked lib boundary IS
// the SW contract from the hook's point of view.

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfflineCases } from "@/hooks/useOfflineCases";
import { caseFactory } from "./fixtures";

vi.mock("@/lib/offline-cases", () => {
  return {
    readSavedCaseIds: vi.fn(() => new Set<string>()),
    writeSavedCaseIds: vi.fn(),
    listOfflineUrls: vi.fn(async () => null),
    saveCaseOffline: vi.fn(async () => ({ ok: true, evictedCount: 0 })),
    removeCaseOffline: vi.fn(async () => ({ ok: true })),
    purgeAllOffline: vi.fn(async () => true),
    readStorageEstimate: vi.fn(async () => null),
    postToSW: vi.fn(async () => null),
  };
});

import * as offlineLib from "@/lib/offline-cases";

const VIDEO_URL = "/api/media/abc123.mp4";

function buildVideoCase(id: string) {
  return caseFactory({
    id,
    media: { kind: "video", src: VIDEO_URL, name: `${id}.mp4`, type: "video/mp4" },
  });
}

describe("useOfflineCases — hook surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage between tests so the seed Set is empty
    // unless a specific test overrides `readSavedCaseIds`.
    (offlineLib.readSavedCaseIds as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Set<string>(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hydrates the saved set from localStorage on mount", () => {
    (offlineLib.readSavedCaseIds as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Set(["c1", "c2"]),
    );
    const cases = [buildVideoCase("c1"), buildVideoCase("c2")];
    const { result } = renderHook(() => useOfflineCases({ cases }));
    expect(result.current.isSaved("c1")).toBe(true);
    expect(result.current.isSaved("c2")).toBe(true);
    expect(result.current.isSaved("c3")).toBe(false);
  });

  it("save() flips the case to saved and returns true on SW success", async () => {
    const cases = [buildVideoCase("c1")];
    const { result } = renderHook(() => useOfflineCases({ cases }));
    let ok = false;
    await act(async () => {
      ok = await result.current.save("c1");
    });
    expect(ok).toBe(true);
    expect(result.current.isSaved("c1")).toBe(true);
    expect(offlineLib.saveCaseOffline).toHaveBeenCalledWith("c1", VIDEO_URL);
  });

  it("save() surfaces LRU eviction count via the notify callback", async () => {
    (offlineLib.saveCaseOffline as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      evictedCount: 3,
    });
    const cases = [buildVideoCase("c1")];
    const notify = vi.fn();
    const { result } = renderHook(() => useOfflineCases({ cases, notify }));
    await act(async () => {
      await result.current.save("c1");
    });
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/3 casos/));
  });

  it("save() reports SW errors and leaves the state unchanged", async () => {
    (offlineLib.saveCaseOffline as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      evictedCount: 0,
      error: "quota exceeded after retries",
    });
    const cases = [buildVideoCase("c1")];
    const notify = vi.fn();
    const { result } = renderHook(() => useOfflineCases({ cases, notify }));
    const ok = await act(async () => await result.current.save("c1"));
    expect(ok).toBe(false);
    expect(result.current.isSaved("c1")).toBe(false);
    expect(notify).toHaveBeenCalled();
  });

  it("remove() clears the case from saved state", async () => {
    (offlineLib.readSavedCaseIds as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Set(["c1"]),
    );
    const cases = [buildVideoCase("c1")];
    const { result } = renderHook(() => useOfflineCases({ cases }));
    expect(result.current.isSaved("c1")).toBe(true);
    await act(async () => {
      await result.current.remove("c1");
    });
    expect(result.current.isSaved("c1")).toBe(false);
    expect(offlineLib.removeCaseOffline).toHaveBeenCalledWith("c1", VIDEO_URL);
  });

  it("toggle() swings to the opposite state", async () => {
    const cases = [buildVideoCase("c1")];
    const { result } = renderHook(() => useOfflineCases({ cases }));
    // Off → on.
    await act(async () => {
      await result.current.toggle("c1");
    });
    expect(result.current.isSaved("c1")).toBe(true);
    expect(offlineLib.saveCaseOffline).toHaveBeenCalledWith("c1", VIDEO_URL);
    // On → off.
    await act(async () => {
      await result.current.toggle("c1");
    });
    expect(result.current.isSaved("c1")).toBe(false);
    expect(offlineLib.removeCaseOffline).toHaveBeenCalledWith("c1", VIDEO_URL);
  });

  it("boot reconcile drops local IDs not present in the SW cache", async () => {
    // Local says c1 + c2 saved; SW reports only c1 cached.
    (offlineLib.readSavedCaseIds as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Set(["c1", "c2"]),
    );
    (offlineLib.listOfflineUrls as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      "/api/media/abc123.mp4", // c1's URL only
    ]);
    const cases = [
      buildVideoCase("c1"),
      caseFactory({
        id: "c2",
        media: { kind: "video", src: "/api/media/def456.mp4", name: "c2.mp4", type: "video/mp4" },
      }),
    ];
    const { result } = renderHook(() => useOfflineCases({ cases }));
    // The reconcile effect runs after first render — wait for it.
    await waitFor(() => {
      expect(result.current.isSaved("c2")).toBe(false);
    });
    expect(result.current.isSaved("c1")).toBe(true);
  });
});
