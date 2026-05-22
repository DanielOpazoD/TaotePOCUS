// Smoke test for the bundled modal-state hook. The hook is
// mechanical (six useState calls returned as a single object) —
// the test pins the shape + the basic flip semantics so a
// refactor accidentally dropping a flag is caught immediately.

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAppModalState } from "@/hooks/useAppModalState";
import { caseFactory } from "./fixtures";

describe("useAppModalState", () => {
  it("initialises every flag to false + editingCase to null", () => {
    const { result } = renderHook(() => useAppModalState());
    expect(result.current.authOpen).toBe(false);
    expect(result.current.formOpen).toBe(false);
    expect(result.current.drawerOpen).toBe(false);
    expect(result.current.shortcutsOpen).toBe(false);
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.paletteOpen).toBe(false);
    expect(result.current.editingCase).toBeNull();
  });

  it("flags flip independently — touching one doesn't move the others", () => {
    const { result } = renderHook(() => useAppModalState());
    act(() => {
      result.current.setAuthOpen(true);
    });
    expect(result.current.authOpen).toBe(true);
    expect(result.current.formOpen).toBe(false);
    expect(result.current.drawerOpen).toBe(false);
    expect(result.current.shortcutsOpen).toBe(false);
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.paletteOpen).toBe(false);
  });

  it("editingCase stores the case record", () => {
    const { result } = renderHook(() => useAppModalState());
    const c = caseFactory({ id: "test-1" });
    act(() => {
      result.current.setEditingCase(c);
    });
    expect(result.current.editingCase).toBe(c);
    act(() => {
      result.current.setEditingCase(null);
    });
    expect(result.current.editingCase).toBeNull();
  });

  it("setters are stable references across renders (cheap to pass as deps)", () => {
    const { result, rerender } = renderHook(() => useAppModalState());
    const firstSetters = {
      setAuthOpen: result.current.setAuthOpen,
      setFormOpen: result.current.setFormOpen,
      setEditingCase: result.current.setEditingCase,
      setDrawerOpen: result.current.setDrawerOpen,
      setShortcutsOpen: result.current.setShortcutsOpen,
      setSettingsOpen: result.current.setSettingsOpen,
      setPaletteOpen: result.current.setPaletteOpen,
    };
    rerender();
    // React useState setters are guaranteed stable. Pin it so a
    // future refactor (wrapping in useCallback or replacing with
    // a reducer) doesn't accidentally break that contract.
    expect(result.current.setAuthOpen).toBe(firstSetters.setAuthOpen);
    expect(result.current.setFormOpen).toBe(firstSetters.setFormOpen);
    expect(result.current.setEditingCase).toBe(firstSetters.setEditingCase);
    expect(result.current.setDrawerOpen).toBe(firstSetters.setDrawerOpen);
    expect(result.current.setShortcutsOpen).toBe(firstSetters.setShortcutsOpen);
    expect(result.current.setSettingsOpen).toBe(firstSetters.setSettingsOpen);
    expect(result.current.setPaletteOpen).toBe(firstSetters.setPaletteOpen);
  });
});
