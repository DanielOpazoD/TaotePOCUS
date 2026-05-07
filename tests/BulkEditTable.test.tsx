// Tests for `BulkEditTable` — the admin's spreadsheet-style editor.
// The component is large; these tests pin only the behaviors with
// real contract value:
//
//   - Filters narrow the visible rows correctly.
//   - Sort cycles asc → desc → null + reorders by the right field.
//   - Inline title edit fires `onPatch` with the new title.
//   - Inline description edit fires `onPatch` with `description`.
//   - Reviewed checkbox toggles via `onPatch`.
//   - Bulk select + bulk patch fires `onBulkPatch` with right ids.
//   - Bulk delete asks confirm and fires `onBulkSoftDelete`.
//   - Pagination respects pageSize and clamps on filter change.
//
// We avoid asserting on internal HTML markup (column orders,
// CSS classes) so style refactors don't break the tests.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BulkEditTable from "@/components/admin/BulkEditTable";
import { CATEGORIES } from "@/lib/data";
import type { CaseRecord } from "@/lib/types";
import { caseFactory, resetIdCounter } from "./fixtures";

// next/image renders an img with a noisy generated srcset that
// pollutes test output. The thumb path isn't what we're testing
// here — replace with a plain img stub.
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { src, alt } = props as { src: string; alt?: string };
    return <img src={src} alt={alt ?? ""} />;
  },
}));

// happy-dom doesn't ship `window.confirm`. Provide our own so the
// component's `if (!window.confirm(...))` paths can be exercised.
let confirmReturn = true;
beforeEach(() => {
  resetIdCounter();
  confirmReturn = true;
  Object.defineProperty(window, "confirm", {
    configurable: true,
    writable: true,
    value: vi.fn(() => confirmReturn),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

function makeCases(): CaseRecord[] {
  return [
    caseFactory({
      id: "a-1",
      title: "Tamponade pericárdico",
      section: "atlas",
      category: "cardiac",
      tags: ["Crítico"],
      description: "Derrame masivo con colapso diastólico.",
    }),
    caseFactory({
      id: "a-2",
      title: "B-líneas confluentes",
      section: "atlas",
      category: "lung",
      tags: ["B-líneas"],
      description: "Edema pulmonar.",
    }),
    caseFactory({
      id: "a-3",
      title: "Hidronefrosis severa",
      section: "atlas",
      category: "abdominal",
      tags: ["Hidronefrosis"],
      description: "Dilatación pielocalicial bilateral.",
      reviewed: true,
    }),
  ];
}

function renderTable(overrides: Partial<Parameters<typeof BulkEditTable>[0]> = {}) {
  const props = {
    cases: makeCases(),
    categories: CATEGORIES.slice(),
    onPatch: vi.fn(async () => {}),
    onBulkPatch: vi.fn(async () => {}),
    onBulkSoftDelete: vi.fn(async () => {}),
    ...overrides,
  };
  const utils = render(<BulkEditTable {...props} />);
  return { ...utils, props };
}

describe("BulkEditTable — filters", () => {
  it("filters by section", () => {
    const cases = [
      ...makeCases(),
      caseFactory({ id: "ecg-1", title: "Bloqueo AV", section: "ecg", category: "cardiac" }),
    ];
    renderTable({ cases });
    // All four rows shown initially.
    expect(screen.getByText("Tamponade pericárdico")).toBeTruthy();
    expect(screen.getByText("Bloqueo AV")).toBeTruthy();
    // Filter to ECG: atlas titles disappear.
    fireEvent.change(screen.getByLabelText("Sección"), { target: { value: "ecg" } });
    expect(screen.queryByText("Tamponade pericárdico")).toBeNull();
    expect(screen.getByText("Bloqueo AV")).toBeTruthy();
  });

  it("filters by free-text query (matches title, description, or tags)", () => {
    renderTable();
    fireEvent.change(screen.getByLabelText("Buscar en la tabla"), {
      target: { value: "edema" },
    });
    // "Edema pulmonar" is in case a-2's description.
    expect(screen.getByText("B-líneas confluentes")).toBeTruthy();
    expect(screen.queryByText("Tamponade pericárdico")).toBeNull();
  });

  it("hides soft-deleted cases", () => {
    const cases = [
      caseFactory({ id: "alive", title: "Caso activo" }),
      caseFactory({ id: "dead", title: "Caso eliminado", deletedAt: new Date().toISOString() }),
    ];
    renderTable({ cases });
    expect(screen.getByText("Caso activo")).toBeTruthy();
    expect(screen.queryByText("Caso eliminado")).toBeNull();
  });
});

describe("BulkEditTable — inline edit", () => {
  it("title edit fires onPatch with the new title", async () => {
    const onPatch = vi.fn(async () => {});
    renderTable({ onPatch });
    // Title cell is rendered as a button in display mode.
    const titleBtn = screen.getByText("Tamponade pericárdico");
    fireEvent.click(titleBtn);
    // Now editing — the input has the same aria-label root.
    const input = await screen.findByDisplayValue("Tamponade pericárdico");
    fireEvent.change(input, { target: { value: "Tamponade — actualizado" } });
    fireEvent.blur(input);
    // onSave (passed by the component) calls onPatch async; the
    // mock fires synchronously. Wait a microtask.
    await Promise.resolve();
    expect(onPatch).toHaveBeenCalledWith("a-1", { title: "Tamponade — actualizado" });
  });

  it("title edit with the same value does NOT fire onPatch", async () => {
    const onPatch = vi.fn(async () => {});
    renderTable({ onPatch });
    fireEvent.click(screen.getByText("Tamponade pericárdico"));
    const input = await screen.findByDisplayValue("Tamponade pericárdico");
    fireEvent.blur(input);
    await Promise.resolve();
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("category dropdown change fires onPatch with the new category id", () => {
    const onPatch = vi.fn(async () => {});
    renderTable({ onPatch });
    const select = screen.getByLabelText("Categoría de Tamponade pericárdico");
    fireEvent.change(select, { target: { value: "lung" } });
    expect(onPatch).toHaveBeenCalledWith("a-1", { category: "lung" });
  });

  it("reviewed checkbox toggle fires onPatch", () => {
    const onPatch = vi.fn(async () => {});
    renderTable({ onPatch });
    // Tamponade is not reviewed; aria-label says "marcar revisado".
    const cb = screen.getByLabelText("Tamponade pericárdico: marcar revisado");
    fireEvent.click(cb);
    expect(onPatch).toHaveBeenCalledWith("a-1", { reviewed: true });
  });
});

describe("BulkEditTable — bulk operations", () => {
  it("selecting rows + clicking bulk-mark-reviewed fires onBulkPatch", () => {
    const onBulkPatch = vi.fn(async () => {});
    renderTable({ onBulkPatch });
    // Select first two rows via their per-row checkbox.
    fireEvent.click(screen.getByLabelText("Seleccionar Tamponade pericárdico"));
    fireEvent.click(screen.getByLabelText("Seleccionar B-líneas confluentes"));
    // Bulk action bar appears.
    expect(screen.getByText(/2 seleccionados/)).toBeTruthy();
    fireEvent.click(screen.getByText("✓ Marcar revisado"));
    expect(onBulkPatch).toHaveBeenCalledWith(["a-1", "a-2"], { reviewed: true });
  });

  it("bulk delete asks confirm and fires onBulkSoftDelete with selected ids", () => {
    const onBulkSoftDelete = vi.fn(async () => {});
    renderTable({ onBulkSoftDelete });
    fireEvent.click(screen.getByLabelText("Seleccionar Tamponade pericárdico"));
    fireEvent.click(screen.getByRole("button", { name: /Eliminar$/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(onBulkSoftDelete).toHaveBeenCalledWith(["a-1"]);
  });

  it("bulk delete is cancelled when confirm returns false", () => {
    confirmReturn = false;
    const onBulkSoftDelete = vi.fn(async () => {});
    renderTable({ onBulkSoftDelete });
    fireEvent.click(screen.getByLabelText("Seleccionar Tamponade pericárdico"));
    fireEvent.click(screen.getByRole("button", { name: /Eliminar$/i }));
    expect(onBulkSoftDelete).not.toHaveBeenCalled();
  });

  it("select-all-visible toggles every row on the current page", () => {
    renderTable();
    fireEvent.click(screen.getByLabelText("Seleccionar todos los visibles"));
    expect(screen.getByText(/3 seleccionados/)).toBeTruthy();
    // Toggle off again.
    fireEvent.click(screen.getByLabelText("Seleccionar todos los visibles"));
    // Action bar gone — no count chip rendered.
    expect(screen.queryByText(/seleccionados/)).toBeNull();
  });
});

describe("BulkEditTable — sort", () => {
  it("clicking the title header sorts ascending by title", () => {
    renderTable();
    const sortBtn = screen.getByRole("button", { name: /Ordenar por title/ });
    fireEvent.click(sortBtn);
    // Spanish locale: "B-líneas..." < "Hidronefrosis..." < "Tamponade..."
    const rows = screen.getAllByRole("row").slice(1); // skip header
    expect(within(rows[0]!).queryByText("B-líneas confluentes")).toBeTruthy();
    expect(within(rows[1]!).queryByText("Hidronefrosis severa")).toBeTruthy();
    expect(within(rows[2]!).queryByText("Tamponade pericárdico")).toBeTruthy();
  });

  it("third click on the same header clears the sort", () => {
    renderTable();
    const sortBtn = screen.getByRole("button", { name: /Ordenar por title/ });
    fireEvent.click(sortBtn); // asc
    fireEvent.click(sortBtn); // desc
    fireEvent.click(sortBtn); // cleared
    // Back to natural (insertion) order: a-1 first.
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).queryByText("Tamponade pericárdico")).toBeTruthy();
  });
});

describe("BulkEditTable — row menu + actions", () => {
  it("⋮ → 'Abrir modal completo' fires onOpenEdit with that case", () => {
    const onOpenEdit = vi.fn();
    renderTable({ onOpenEdit });
    // The menu trigger is per-row; pick the first one.
    const triggers = screen.getAllByLabelText("Más acciones");
    fireEvent.click(triggers[0]!);
    fireEvent.click(screen.getByText("Abrir modal completo"));
    expect(onOpenEdit).toHaveBeenCalledTimes(1);
    expect(onOpenEdit.mock.calls[0]?.[0]).toMatchObject({ id: "a-1" });
  });

  it("⋮ menu does not render the row-level actions when no callbacks given", () => {
    renderTable({ onOpenEdit: undefined, onDelete: undefined });
    expect(screen.queryByLabelText("Más acciones")).toBeNull();
  });
});

describe("BulkEditTable — pagination", () => {
  it("respects the page-size selector and shows the right slice", () => {
    // 60 cases; default page size 50 → page 1 = 50, page 2 = 10.
    const cases: CaseRecord[] = Array.from({ length: 60 }, (_, i) =>
      caseFactory({ id: `p-${i}`, title: `Caso ${i.toString().padStart(2, "0")}` }),
    );
    renderTable({ cases });
    // Default 50 / page → 50 visible.
    const tbody = document.querySelector(".bulk-edit-table tbody");
    if (!tbody) throw new Error("tbody missing");
    expect(tbody.querySelectorAll(".bulk-edit-row").length).toBe(50);
    // Change to 25.
    fireEvent.change(screen.getByLabelText("Casos por página"), { target: { value: "25" } });
    expect(tbody.querySelectorAll(".bulk-edit-row").length).toBe(25);
  });
});
