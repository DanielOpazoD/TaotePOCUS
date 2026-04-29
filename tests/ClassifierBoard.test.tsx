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
