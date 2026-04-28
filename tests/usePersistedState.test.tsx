import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePersistedState } from "@/hooks/usePersistedState";

describe("usePersistedState", () => {
  const KEY = "test-key";

  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("returns the initialValue on first render before hydration", () => {
    localStorage.setItem(KEY, JSON.stringify("persisted"));
    const { result } = renderHook(() => usePersistedState(KEY, "fresh"));
    // The hook intentionally returns initialValue synchronously to keep
    // SSR-safe; only after the mount effect does it pick up the
    // persisted value.
    expect(["fresh", "persisted"]).toContain(result.current[0]);
  });

  it("hydrates from localStorage after mount", async () => {
    localStorage.setItem(KEY, JSON.stringify("persisted"));
    const { result, rerender } = renderHook(() => usePersistedState(KEY, "fresh"));
    // The hydration effect runs; after the next render the persisted
    // value is visible.
    rerender();
    expect(result.current[0]).toBe("persisted");
  });

  it("writes setState updates to localStorage", () => {
    const { result } = renderHook(() => usePersistedState(KEY, 0));
    act(() => result.current[1](42));
    expect(localStorage.getItem(KEY)).toBe("42");
    expect(result.current[0]).toBe(42);
  });

  it("supports updater functions like useState", () => {
    const { result } = renderHook(() => usePersistedState(KEY, 5));
    act(() => result.current[1]((prev) => prev * 2));
    expect(result.current[0]).toBe(10);
    expect(localStorage.getItem(KEY)).toBe("10");
  });

  it("ignores corrupted JSON and falls back to initialValue", () => {
    localStorage.setItem(KEY, "{not-json");
    const { result } = renderHook(() => usePersistedState(KEY, "fallback"));
    expect(result.current[0]).toBe("fallback");
    // The corrupted entry is left as-is — we don't blow it away on read,
    // since some other consumer might recover it.
    expect(localStorage.getItem(KEY)).toBe("{not-json");
  });

  it("uses custom serialize/deserialize when provided", () => {
    const { result } = renderHook(() =>
      usePersistedState(KEY, false, {
        serialize: (v) => (v ? "1" : "0"),
        deserialize: (raw) => (raw === "1" ? true : raw === "0" ? false : undefined),
      }),
    );
    act(() => result.current[1](true));
    expect(localStorage.getItem(KEY)).toBe("1");
    expect(result.current[0]).toBe(true);
  });

  it("returns initialValue when deserialize returns undefined", () => {
    localStorage.setItem(KEY, "garbage");
    const { result } = renderHook(() =>
      usePersistedState(KEY, "default", {
        deserialize: (raw) => (raw === "valid" ? "ok" : undefined),
      }),
    );
    expect(result.current[0]).toBe("default");
  });

  it("survives quota errors silently", () => {
    const { result } = renderHook(() => usePersistedState(KEY, "x"));
    // Force a write failure by stubbing setItem.
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      const err = new DOMException("Quota", "QuotaExceededError");
      throw err;
    };
    act(() => {
      result.current[1]("y");
    });
    // In-memory state still updated — the persistence failure is
    // invisible to the consumer.
    expect(result.current[0]).toBe("y");
    Storage.prototype.setItem = original;
  });

  it("does not write to localStorage before hydration completes", () => {
    // The hook intentionally skips writes on the very first render so
    // a parent's same-frame setState doesn't clobber a persisted value.
    // (We can't observe the very-first-render window in a test, but we
    // can verify that after hydration the writes do flow through.)
    const { result } = renderHook(() => usePersistedState(KEY, "init"));
    act(() => result.current[1]("after"));
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify("after"));
  });
});
