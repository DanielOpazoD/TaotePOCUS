import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FocusEditor from "@/components/cards/FocusEditor";
import { caseFactory } from "./fixtures";

beforeEach(() => {
  // Stub getBoundingClientRect (see QuickReclassify.test for context).
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    bottom: 100,
    left: 50,
    top: 80,
    right: 70,
    height: 20,
    width: 20,
    x: 50,
    y: 80,
    toJSON: () => ({}),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const open = () => fireEvent.click(screen.getByRole("button", { name: /Ajustar foco/i }));

describe("FocusEditor — toggle + draft preview", () => {
  it("starts closed and exposes only the ⚙ trigger", () => {
    render(<FocusEditor caso={caseFactory()} onPatch={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Ajustar foco/i })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the panel with current focus values pre-loaded", () => {
    const c = caseFactory({ focus: { x: 30, y: 70, scale: 1.5 } });
    render(<FocusEditor caso={c} onPatch={vi.fn()} />);
    open();
    // Zoom value mirrors `scale * 100`.
    expect(screen.getByText("150%")).toBeTruthy();
  });

  it("streams draft to onDraftChange while open and clears on close", () => {
    const onDraftChange = vi.fn();
    render(<FocusEditor caso={caseFactory()} onPatch={vi.fn()} onDraftChange={onDraftChange} />);
    open();
    // First emission on open: the current/default values.
    expect(onDraftChange).toHaveBeenLastCalledWith({ x: 50, y: 50, scale: 1 });

    // Pan right: x increments by PAN_STEP (5).
    fireEvent.click(screen.getByRole("button", { name: /Derecha/i }));
    expect(onDraftChange).toHaveBeenLastCalledWith({ x: 55, y: 50, scale: 1 });

    // Cancel → editor closes → draft reverts to undefined for parent.
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(onDraftChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe("FocusEditor — pan / zoom controls", () => {
  it("clamps x/y between 0 and 100", () => {
    const onDraftChange = vi.fn();
    render(
      <FocusEditor
        caso={caseFactory({ focus: { x: 0, y: 100 } })}
        onPatch={vi.fn()}
        onDraftChange={onDraftChange}
      />,
    );
    open();
    // Push left from x=0 — clamps to 0, no underflow.
    fireEvent.click(screen.getByRole("button", { name: /Izquierda/i }));
    expect(onDraftChange).toHaveBeenLastCalledWith({ x: 0, y: 100, scale: 1 });
    // Push down from y=100 — clamps to 100.
    fireEvent.click(screen.getByRole("button", { name: /Bajar/i }));
    expect(onDraftChange).toHaveBeenLastCalledWith({ x: 0, y: 100, scale: 1 });
  });

  it("clamps scale between 0.5 and 3", () => {
    const onDraftChange = vi.fn();
    render(
      <FocusEditor
        caso={caseFactory({ focus: { scale: 0.5 } })}
        onPatch={vi.fn()}
        onDraftChange={onDraftChange}
      />,
    );
    open();
    fireEvent.click(screen.getByRole("button", { name: /Reducir/i }));
    // Stays at 0.5 — clamp is honored.
    expect(onDraftChange).toHaveBeenLastCalledWith({ x: 50, y: 50, scale: 0.5 });
  });

  it("Reset returns to defaults (50/50/1)", () => {
    const onDraftChange = vi.fn();
    render(
      <FocusEditor
        caso={caseFactory({ focus: { x: 10, y: 90, scale: 2 } })}
        onPatch={vi.fn()}
        onDraftChange={onDraftChange}
      />,
    );
    open();
    fireEvent.click(screen.getByRole("button", { name: /Reset/i }));
    expect(onDraftChange).toHaveBeenLastCalledWith({ x: 50, y: 50, scale: 1 });
  });
});

describe("FocusEditor — save", () => {
  it("commits the draft via onPatch when Guardar is clicked", () => {
    const onPatch = vi.fn();
    const c = caseFactory({ id: "c-1" });
    render(<FocusEditor caso={c} onPatch={onPatch} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: /Aumentar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar/i }));
    expect(onPatch).toHaveBeenCalledWith("c-1", {
      focus: { x: 50, y: 50, scale: 1.1 },
    });
  });

  it("strips the focus field when saving with all-default values", () => {
    const onPatch = vi.fn();
    const c = caseFactory({ id: "c-2", focus: { x: 30, y: 30, scale: 1 } });
    render(<FocusEditor caso={c} onPatch={onPatch} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: /Reset/i }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar/i }));
    // Defaults → field is dropped (undefined, not stored).
    expect(onPatch).toHaveBeenCalledWith("c-2", { focus: undefined });
  });

  it("closes the panel after a successful save", () => {
    render(<FocusEditor caso={caseFactory()} onPatch={vi.fn()} />);
    open();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Guardar/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
