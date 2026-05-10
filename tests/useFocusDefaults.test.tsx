// Pin the storage + setter contract of `useFocusDefaults`. We don't
// test the resolver here (lives in `focus.test.ts`); this file just
// confirms the hook reads + writes the localStorage blob correctly,
// drops corrupt entries on load, and the three slot setters surface
// the right partial updates.

import { describe, expect, it, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFocusDefaults } from "@/hooks/useFocusDefaults";
import { STORAGE_KEYS } from "@/lib/storage-keys";

const KEY = STORAGE_KEYS.focusDefaults;

describe("useFocusDefaults", () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it("starts empty when no persisted blob exists", () => {
    const { result } = renderHook(() => useFocusDefaults());
    expect(result.current.defaults).toEqual({});
  });

  it("hydrates from localStorage when a valid blob is present", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        global: { x: 30, y: 30, scale: 1.5 },
        sections: { atlas: { scale: 1.2 } },
        categories: { cardiac: { x: 25, y: 75 } },
      }),
    );
    const { result } = renderHook(() => useFocusDefaults());
    expect(result.current.defaults).toEqual({
      global: { x: 30, y: 30, scale: 1.5 },
      sections: { atlas: { scale: 1.2 } },
      categories: { cardiac: { x: 25, y: 75 } },
    });
  });

  it("clamps out-of-range fields and drops non-numeric corruption", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        global: { x: 999, y: -50, scale: 100 },
        sections: { atlas: { scale: "huge" } }, // wrong type
        categories: { cardiac: null }, // wrong shape
      }),
    );
    const { result } = renderHook(() => useFocusDefaults());
    expect(result.current.defaults.global).toEqual({ x: 100, y: 0, scale: 3 });
    // Section value sanitized to {} — kept as a slot; categories
    // dropped entirely (null → undefined).
    expect(result.current.defaults.sections).toEqual({ atlas: {} });
    expect(result.current.defaults.categories).toBeUndefined();
  });

  it("setGlobal writes / clears the global slot", () => {
    const { result } = renderHook(() => useFocusDefaults());
    act(() => result.current.setGlobal({ scale: 2 }));
    expect(result.current.defaults.global).toEqual({ scale: 2 });
    act(() => result.current.setGlobal(undefined));
    expect(result.current.defaults.global).toBeUndefined();
  });

  it("setSection writes per-section and removes empty maps", () => {
    const { result } = renderHook(() => useFocusDefaults());
    act(() => result.current.setSection("atlas", { x: 25, y: 75 }));
    expect(result.current.defaults.sections).toEqual({ atlas: { x: 25, y: 75 } });
    // Clearing the only entry should remove the parent `sections` key.
    act(() => result.current.setSection("atlas", undefined));
    expect(result.current.defaults.sections).toBeUndefined();
  });

  it("setCategory writes per-category and removes empty maps", () => {
    const { result } = renderHook(() => useFocusDefaults());
    act(() => result.current.setCategory("cardiac", { scale: 1.5 }));
    expect(result.current.defaults.categories).toEqual({ cardiac: { scale: 1.5 } });
    act(() => result.current.setCategory("cardiac", undefined));
    expect(result.current.defaults.categories).toBeUndefined();
  });

  it("reset() wipes every slot back to {}", () => {
    const { result } = renderHook(() => useFocusDefaults());
    act(() => {
      result.current.setGlobal({ scale: 2 });
      result.current.setSection("atlas", { x: 30 });
      result.current.setCategory("cardiac", { y: 70 });
    });
    expect(result.current.defaults).not.toEqual({});
    act(() => result.current.reset());
    expect(result.current.defaults).toEqual({});
  });

  it("persists the blob to localStorage", () => {
    const { result } = renderHook(() => useFocusDefaults());
    act(() => result.current.setGlobal({ scale: 1.5 }));
    const persisted = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    expect(persisted).toEqual({ global: { scale: 1.5 } });
  });
});
