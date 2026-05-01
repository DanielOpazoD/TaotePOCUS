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
    expect(result.current.toast?.message).toBe("hello");
    expect(result.current.toast?.undo).toBeUndefined();

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
    expect(result.current.toast?.message).toBe("second");
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

  // ─── undo affordance ────────────────────────────────────────────

  it("toast carries an undo handler when one is supplied", () => {
    const { result } = renderHook(() => useToast(1000));
    const undo = vi.fn();
    act(() => result.current.showToast("Caso movido", { undo }));
    expect(result.current.toast?.message).toBe("Caso movido");
    expect(result.current.toast?.undo).toBeTypeOf("function");
    expect(result.current.toast?.undoLabel).toBe("Deshacer");
  });

  it("undo toasts default to a longer (6 s) clear window", () => {
    // The hook's default is 2000ms for plain info; toasts with an
    // undo callback widen to 6000ms so the user has time to react.
    const { result } = renderHook(() => useToast(2000));
    act(() => result.current.showToast("X aplicado", { undo: () => {} }));
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.toast?.message).toBe("X aplicado");
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.toast).toBeNull();
  });

  it("clicking the wrapped undo callback runs the user fn and dismisses the toast", () => {
    const { result } = renderHook(() => useToast(1000));
    const userUndo = vi.fn();
    act(() => result.current.showToast("Aplicado", { undo: userUndo }));
    act(() => result.current.toast?.undo?.());
    expect(userUndo).toHaveBeenCalledTimes(1);
    expect(result.current.toast).toBeNull();
  });

  it("supports a custom undoLabel", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("hi", { undo: () => {}, undoLabel: "Revertir" }));
    expect(result.current.toast?.undoLabel).toBe("Revertir");
  });

  it("dismissToast clears the chip and timer", () => {
    const { result } = renderHook(() => useToast(1000));
    act(() => result.current.showToast("hi"));
    act(() => result.current.dismissToast());
    expect(result.current.toast).toBeNull();
    // Verify the timer was also cleared (no resurrection).
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toast).toBeNull();
  });
});
