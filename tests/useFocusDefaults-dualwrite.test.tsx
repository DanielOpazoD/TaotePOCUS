// Dual-write seam for `useFocusDefaults`. The localStorage-only
// behavior is pinned in `useFocusDefaults.test.tsx` (default flag off).
// This file mocks `IS_NETLIFY_DB_ENABLED = true` so we can assert:
//
//   - On mount, the hook calls `dbGetFocusDefaults` once and replaces
//     the local cache when the DB has a non-empty payload.
//   - Each setter mirrors the FULL blob to `dbSetFocusDefaults`.
//   - A failing mirror logs but doesn't roll back the local update.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

// IMPORTANT: mock both the env flag AND the DB action module BEFORE
// importing the hook. The hook reads `IS_NETLIFY_DB_ENABLED` at module
// load time inside the dual-write branch; the action module is the
// thing we want to spy on.
vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return { ...actual, IS_NETLIFY_DB_ENABLED: true };
});
vi.mock("@/app/actions/db", () => ({
  dbGetFocusDefaults: vi.fn(),
  dbSetFocusDefaults: vi.fn(),
}));

import { useFocusDefaults } from "@/hooks/useFocusDefaults";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { dbGetFocusDefaults, dbSetFocusDefaults } from "@/app/actions/db";

const KEY = STORAGE_KEYS.focusDefaults;

beforeEach(() => {
  localStorage.removeItem(KEY);
  vi.mocked(dbGetFocusDefaults).mockReset();
  vi.mocked(dbSetFocusDefaults).mockReset();
  // Default mocks: empty DB read, ok writes.
  vi.mocked(dbGetFocusDefaults).mockResolvedValue({});
  vi.mocked(dbSetFocusDefaults).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useFocusDefaults — dual-write seam", () => {
  it("hydrates from the DB on mount when the flag is on", async () => {
    vi.mocked(dbGetFocusDefaults).mockResolvedValue({
      global: { x: 25, y: 75, scale: 1.2 },
    });
    const { result } = renderHook(() => useFocusDefaults());
    await waitFor(() => {
      expect(result.current.defaults.global).toEqual({ x: 25, y: 75, scale: 1.2 });
    });
    expect(dbGetFocusDefaults).toHaveBeenCalledTimes(1);
  });

  it("keeps localStorage when the DB returns empty (flag-just-on case)", async () => {
    localStorage.setItem(KEY, JSON.stringify({ global: { scale: 1.5 } }));
    const { result } = renderHook(() => useFocusDefaults());
    // Wait for the hydration effect to run; even though the DB is
    // empty, the local cache should still be visible.
    await waitFor(() => {
      expect(result.current.defaults.global).toEqual({ scale: 1.5 });
    });
    expect(dbGetFocusDefaults).toHaveBeenCalledTimes(1);
  });

  it("mirrors setGlobal's full blob to the DB", async () => {
    const { result } = renderHook(() => useFocusDefaults());
    await waitFor(() => expect(dbGetFocusDefaults).toHaveBeenCalled());
    act(() => result.current.setGlobal({ scale: 2 }));
    await waitFor(() => {
      expect(dbSetFocusDefaults).toHaveBeenCalled();
    });
    const lastCall = vi.mocked(dbSetFocusDefaults).mock.calls.at(-1)!;
    expect(lastCall[0]).toEqual({ global: { scale: 2 } });
  });

  it("mirrors setSection's full blob (including pre-existing slots)", async () => {
    const { result } = renderHook(() => useFocusDefaults());
    await waitFor(() => expect(dbGetFocusDefaults).toHaveBeenCalled());
    act(() => {
      result.current.setGlobal({ scale: 1.5 });
      result.current.setSection("atlas", { x: 25, y: 75 });
    });
    await waitFor(() => {
      expect(dbSetFocusDefaults).toHaveBeenCalled();
    });
    const lastCall = vi.mocked(dbSetFocusDefaults).mock.calls.at(-1)!;
    expect(lastCall[0]).toEqual({
      global: { scale: 1.5 },
      sections: { atlas: { x: 25, y: 75 } },
    });
  });

  it("local state survives a failing DB mirror", async () => {
    vi.mocked(dbSetFocusDefaults).mockResolvedValue({ ok: false, reason: "unknown" });
    const { result } = renderHook(() => useFocusDefaults());
    await waitFor(() => expect(dbGetFocusDefaults).toHaveBeenCalled());
    act(() => result.current.setGlobal({ scale: 2 }));
    // Even though the DB mirror returned not-ok, the local cache
    // updates optimistically — the next reload will re-hydrate from
    // the DB and reconcile.
    expect(result.current.defaults.global).toEqual({ scale: 2 });
  });

  it("reset() mirrors an empty blob to the DB", async () => {
    const { result } = renderHook(() => useFocusDefaults());
    await waitFor(() => expect(dbGetFocusDefaults).toHaveBeenCalled());
    act(() => {
      result.current.setGlobal({ scale: 2 });
      result.current.reset();
    });
    await waitFor(() => {
      expect(dbSetFocusDefaults).toHaveBeenCalled();
    });
    const lastCall = vi.mocked(dbSetFocusDefaults).mock.calls.at(-1)!;
    expect(lastCall[0]).toEqual({});
  });
});
