import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AdminThumbMenu from "@/components/cards/AdminThumbMenu";
import { caseFactory } from "./fixtures";
import type { Category } from "@/lib/types";

const categories: Category[] = [
  { id: "cardiac", label: "Cardíaco" },
  { id: "lung", label: "Pulmonar" },
];

beforeEach(() => {
  // Layout effect calls getBoundingClientRect — happy-dom returns
  // zeros which is fine for assertion but we stub for clarity.
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

describe("AdminThumbMenu — toggle", () => {
  it("renders only the trigger when closed", () => {
    render(<AdminThumbMenu caso={caseFactory()} categories={categories} onPatch={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Acciones admin/i })).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens a menu listing all available actions", () => {
    render(
      <AdminThumbMenu
        caso={caseFactory()}
        categories={categories}
        onPatch={vi.fn()}
        onDelete={vi.fn()}
        onPurge={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Acciones admin/i }));
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Reclasificar/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Ajustar foco/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Mover a papelera/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Eliminar permanentemente/i })).toBeTruthy();
  });

  it("hides destructive items when their callbacks aren't provided", () => {
    render(
      <AdminThumbMenu
        caso={caseFactory()}
        categories={categories}
        onPatch={vi.fn()}
        // no onDelete / onPurge
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Acciones admin/i }));
    expect(screen.queryByRole("menuitem", { name: /Mover a papelera/i })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Eliminar permanentemente/i })).toBeNull();
    // Reclassify and Focus stay visible (they only need onPatch).
    expect(screen.getByRole("menuitem", { name: /Reclasificar/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Ajustar foco/i })).toBeTruthy();
  });

  it("Escape from the menu closes everything", () => {
    render(
      <AdminThumbMenu
        caso={caseFactory()}
        categories={categories}
        onPatch={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Acciones admin/i }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("AdminThumbMenu — destructive actions", () => {
  it("fires onDelete and closes the menu", () => {
    const onDelete = vi.fn();
    render(
      <AdminThumbMenu
        caso={caseFactory()}
        categories={categories}
        onPatch={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Acciones admin/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Mover a papelera/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("fires onPurge and closes the menu", () => {
    const onPurge = vi.fn();
    render(
      <AdminThumbMenu
        caso={caseFactory()}
        categories={categories}
        onPatch={vi.fn()}
        onPurge={onPurge}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Acciones admin/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Eliminar permanentemente/i }));
    expect(onPurge).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("AdminThumbMenu — reclassify sub-view", () => {
  it("pivots into the reclassify panel and applies a section", () => {
    const onPatch = vi.fn();
    const caso = caseFactory({ id: "c-r1", section: "atlas", tags: ["Sin clasificar"] });
    render(<AdminThumbMenu caso={caso} categories={categories} onPatch={onPatch} />);

    fireEvent.click(screen.getByRole("button", { name: /Acciones admin/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Reclasificar/i }));

    // Sub-view: "← Atrás" + section/category lists.
    expect(screen.getByRole("button", { name: /Atrás/i })).toBeTruthy();
    expect(screen.getByText("Sección")).toBeTruthy();
    expect(screen.getByText("Categoría")).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitemradio", { name: /ECG/i }));
    // Section change strips the import-time tag, same as drag-drop.
    // Tags are bilingual now; the cleaned ES list drops "Sin clasificar"
    // and the EN slot stays unset (the case had none).
    expect(onPatch).toHaveBeenCalledWith("c-r1", {
      section: "ecg",
      tags: { es: [] },
    });
    // Picking a value closes the menu entirely.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape from the sub-view returns to the main menu", () => {
    render(<AdminThumbMenu caso={caseFactory()} categories={categories} onPatch={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Acciones admin/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Reclasificar/i }));
    // Sub-view active.
    expect(screen.getByRole("button", { name: /Atrás/i })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    // Back at the menu, not closed.
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Reclasificar/i })).toBeTruthy();
  });
});

describe("AdminThumbMenu — focus sub-view", () => {
  it("opens the focus inline editor and saves a draft", () => {
    const onPatch = vi.fn();
    render(
      <AdminThumbMenu
        caso={caseFactory({ id: "c-f1" })}
        categories={categories}
        onPatch={onPatch}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Acciones admin/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Ajustar foco/i }));

    // Bump zoom, save.
    fireEvent.click(screen.getByRole("button", { name: /Aumentar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar/i }));

    expect(onPatch).toHaveBeenCalledWith("c-f1", {
      focus: { x: 50, y: 50, scale: 1.1 },
    });
  });

  it("streams draft to onFocusDraftChange and clears on close", () => {
    const onFocusDraftChange = vi.fn();
    render(
      <AdminThumbMenu
        caso={caseFactory()}
        categories={categories}
        onPatch={vi.fn()}
        onFocusDraftChange={onFocusDraftChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Acciones admin/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Ajustar foco/i }));

    // First call on mount: defaults streamed up.
    expect(onFocusDraftChange).toHaveBeenLastCalledWith({ x: 50, y: 50, scale: 1 });

    // Pan: parent receives updated draft.
    fireEvent.click(screen.getByRole("button", { name: /Derecha/i }));
    expect(onFocusDraftChange).toHaveBeenLastCalledWith({ x: 55, y: 50, scale: 1 });

    // Going back to the menu unmounts the focus inline → cleanup
    // pushes `undefined` so the parent reverts to the persisted focus.
    fireEvent.click(screen.getByRole("button", { name: /Atrás/i }));
    expect(onFocusDraftChange).toHaveBeenLastCalledWith(undefined);
  });
});
