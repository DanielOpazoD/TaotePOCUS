import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useToast } from "@/hooks/useToast";

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no toast", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toast).toBeNull();
  });

  it("showToast sets the message and clears after duration", () => {
    const { result } = renderHook(() => useToast(1000));
    act(() => result.current.showToast("hello"));
    expect(result.current.toast).toBe("hello");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.toast).toBeNull();
  });

  it("a second showToast resets the timer (the first never triggers a clear)", () => {
    const { result } = renderHook(() => useToast(1000));
    act(() => result.current.showToast("first"));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => result.current.showToast("second"));
    // 500ms more — the original timer would have fired, but it was reset.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.toast).toBe("second");
    // Now the new timer fires.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.toast).toBeNull();
  });

  it("showToast is referentially stable across renders", () => {
    const { result, rerender } = renderHook(() => useToast());
    const first = result.current.showToast;
    rerender();
    expect(result.current.showToast).toBe(first);
  });

  it("clears its timer on unmount", () => {
    const { result, unmount } = renderHook(() => useToast(1000));
    act(() => result.current.showToast("hi"));
    unmount();
    // Advancing time after unmount should not throw or schedule state updates.
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
  });
});
