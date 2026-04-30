import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ClassifierBoard from "@/components/admin/ClassifierBoard";
import { caseFactory } from "./fixtures";

// CineLoop renders a canvas + RAF; not relevant here.
vi.mock("../components/cine", () => ({
  __esModule: true,
  CineLoop: () => <div data-testid="cine-loop-stub" />,
}));

// Helper: build a DataTransfer-like object for synthetic drag events.
// happy-dom doesn't ship a full DataTransfer, but our handlers only
// touch `setData`, `effectAllowed`, `dropEffect`, and `setDragImage`.
function makeDragEvent() {
  return {
    dataTransfer: {
      setData: vi.fn(),
      setDragImage: vi.fn(),
      effectAllowed: "",
      dropEffect: "",
    },
  };
}

describe("ClassifierBoard drop handling", () => {
  // Pin the rule that surfaced in 2026-04: dropping onto a section
  // must clear the import-time `Sin clasificar` tag, same as a category
  // drop. Otherwise the card stays stuck under the unclassified filter
  // even after the section was successfully patched, which feels like
  // the drop failed.
  it("drop on section clears the 'Sin clasificar' tag (same as category)", () => {
    const onPatch = vi.fn();
    const cases = [
      caseFactory({
        id: "c-stuck",
        title: "Caso pendiente",
        section: "atlas",
        tags: ["Sin clasificar", "Cardíaco"],
      }),
    ];

    render(<ClassifierBoard cases={cases} onPatch={onPatch} onOpenEdit={vi.fn()} />);

    // Find the section drop zone (ECG) and the draggable card. The
    // card has no explicit role, so we walk up from the title text
    // node to its containing <article>.
    const ecgZone = screen.getByRole("button", { name: "ECG" });
    const titleNode = screen.getByText("Caso pendiente");
    const articleEl = titleNode.closest("article");
    expect(articleEl).not.toBeNull();

    // Simulate the drag lifecycle. The component reads `e.dataTransfer`
    // in onDragStart; we hand it a stub via the second arg of fireEvent.
    fireEvent.dragStart(articleEl as HTMLElement, makeDragEvent());
    fireEvent.dragEnter(ecgZone, makeDragEvent());
    fireEvent.drop(ecgZone, makeDragEvent());

    expect(onPatch).toHaveBeenCalledTimes(1);
    const [id, patch] = onPatch.mock.calls[0]!;
    expect(id).toBe("c-stuck");
    expect(patch.section).toBe("ecg");
    // The fix: section drops also strip "Sin clasificar".
    expect(patch.tags).toEqual(["Cardíaco"]);
    expect(patch.tags).not.toContain("Sin clasificar");
  });

  it("auxiliary filters (search / section / category) compose with the queue-state pill", () => {
    const cases = [
      caseFactory({
        id: "c-cardio-atlas",
        title: "Tamponade cardíaco",
        section: "atlas",
        category: "cardiac",
        tags: [],
      }),
      caseFactory({
        id: "c-lung-atlas",
        title: "Edema pulmonar",
        section: "atlas",
        category: "lung",
        tags: [],
      }),
      caseFactory({
        id: "c-cardio-ecg",
        title: "STEMI inferior",
        section: "ecg",
        category: "cardiac",
        tags: [],
      }),
    ];

    render(<ClassifierBoard cases={cases} onPatch={vi.fn()} onOpenEdit={vi.fn()} />);

    // Switch to "Todos" so all classified cases are in the pool.
    fireEvent.click(screen.getByRole("tab", { name: /Todos/ }));

    // All 3 cases should be visible by default after switching to Todos.
    expect(screen.getByText("Tamponade cardíaco")).toBeTruthy();
    expect(screen.getByText("Edema pulmonar")).toBeTruthy();
    expect(screen.getByText("STEMI inferior")).toBeTruthy();

    // Filter by section "ecg" — only the STEMI case should remain.
    const sectionSelect = screen.getByLabelText("Filtrar por sección") as HTMLSelectElement;
    fireEvent.change(sectionSelect, { target: { value: "ecg" } });
    expect(screen.queryByText("Tamponade cardíaco")).toBeNull();
    expect(screen.queryByText("Edema pulmonar")).toBeNull();
    expect(screen.getByText("STEMI inferior")).toBeTruthy();

    // Reset section, filter by category "cardiac" — both cardiac
    // cases visible, the lung one hidden.
    fireEvent.change(sectionSelect, { target: { value: "__any__" } });
    const catSelect = screen.getByLabelText("Filtrar por categoría") as HTMLSelectElement;
    fireEvent.change(catSelect, { target: { value: "cardiac" } });
    expect(screen.getByText("Tamponade cardíaco")).toBeTruthy();
    expect(screen.queryByText("Edema pulmonar")).toBeNull();
    expect(screen.getByText("STEMI inferior")).toBeTruthy();

    // Add a text search "STEMI" — only the ECG case should match.
    const searchInput = screen.getByLabelText("Buscar caso por texto");
    fireEvent.change(searchInput, { target: { value: "STEMI" } });
    expect(screen.queryByText("Tamponade cardíaco")).toBeNull();
    expect(screen.queryByText("Edema pulmonar")).toBeNull();
    expect(screen.getByText("STEMI inferior")).toBeTruthy();
  });

  it("drop on category clears the 'Sin clasificar' tag and assigns the category", () => {
    const onPatch = vi.fn();
    const cases = [
      caseFactory({
        id: "c-pending",
        title: "Otro caso",
        category: "lung",
        tags: ["Sin clasificar", "Pediátrico"],
      }),
    ];

    render(<ClassifierBoard cases={cases} onPatch={onPatch} onOpenEdit={vi.fn()} />);

    const titleNode = screen.getByText("Otro caso");
    const articleEl = titleNode.closest("article");
    expect(articleEl).not.toBeNull();
    const cardiacZone = screen.getByRole("button", { name: "Cardíaco" });

    fireEvent.dragStart(articleEl as HTMLElement, makeDragEvent());
    fireEvent.dragEnter(cardiacZone, makeDragEvent());
    fireEvent.drop(cardiacZone, makeDragEvent());

    expect(onPatch).toHaveBeenCalledTimes(1);
    const [id, patch] = onPatch.mock.calls[0]!;
    expect(id).toBe("c-pending");
    expect(patch.category).toBe("cardiac");
    expect(patch.tags).toEqual(["Pediátrico"]);
    expect(patch.tags).not.toContain("Sin clasificar");
  });
});
