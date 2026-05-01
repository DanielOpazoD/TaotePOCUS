// Tests for `useMirrorFailureToast` — the rate-limited toast that
// fires when a DB write succeeds locally but fails to mirror to the
// Server Action. Pure side-effect hook; we mock `setMirrorFailureHandler`
// to capture the registered callback and invoke it manually.

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the handler the hook registers so the test can fire it
// without actually triggering a DB call.
let registeredHandler: ((area: string) => void) | null = null;

vi.mock("@/lib/db-mirror", () => ({
  setMirrorFailureHandler: vi.fn((h: ((area: string) => void) | null) => {
    registeredHandler = h;
  }),
}));

import { useMirrorFailureToast } from "@/hooks/useMirrorFailureToast";

beforeEach(() => {
  registeredHandler = null;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useMirrorFailureToast", () => {
  it("registers a handler on mount and clears it on unmount", () => {
    const notify = vi.fn();
    const { unmount } = renderHook(() => useMirrorFailureToast(notify));

    expect(registeredHandler).toBeTypeOf("function");
    unmount();
    expect(registeredHandler).toBeNull();
  });

  it("calls notify with a Spanish copy when a mirror failure fires", () => {
    const notify = vi.fn();
    renderHook(() => useMirrorFailureToast(notify));

    registeredHandler?.("cases.save");

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      "Cambio guardado local · sincronización con la base de datos pendiente",
    );
  });

  it("rate-limits to one toast every 5 s during a sustained failure burst", () => {
    const notify = vi.fn();
    renderHook(() => useMirrorFailureToast(notify));

    // 4 failures inside the same 5 s window — only the first should
    // produce a toast. Without rate-limiting, a flaky DB connection
    // during an admin's flurry of clicks would queue dozens.
    registeredHandler?.("cases.save");
    vi.advanceTimersByTime(1000);
    registeredHandler?.("cases.remove");
    vi.advanceTimersByTime(1000);
    registeredHandler?.("cases.purge");
    vi.advanceTimersByTime(1000);
    registeredHandler?.("favs.toggle");
    expect(notify).toHaveBeenCalledTimes(1);

    // After the window, a fresh failure produces a new toast.
    vi.advanceTimersByTime(2500);
    registeredHandler?.("cases.save");
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
