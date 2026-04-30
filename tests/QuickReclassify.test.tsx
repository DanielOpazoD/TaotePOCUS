import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import QuickReclassify from "@/components/cards/QuickReclassify";
import { caseFactory } from "./fixtures";
import type { Category } from "@/lib/types";

const categories: Category[] = [
  { id: "cardiac", label: "Cardíaco" },
  { id: "lung", label: "Pulmonar" },
  { id: "c:peds", label: "Pediatría" },
];

beforeEach(() => {
  // Stub getBoundingClientRect for the trigger so the layout effect
  // doesn't crash on happy-dom (which returns all zeros). Coords don't
  // matter for assertion — only that the popover renders.
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

describe("QuickReclassify — toggle", () => {
  it("renders only the trigger when closed", () => {
    render(<QuickReclassify caso={caseFactory()} categories={categories} onPatch={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Cambiar sección/i })).toBeTruthy();
    // Popover content not rendered yet.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens the portal-rendered popover on click", () => {
    render(<QuickReclassify caso={caseFactory()} categories={categories} onPatch={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Cambiar sección/i }));
    expect(screen.getByRole("menu")).toBeTruthy();
    // Both lists visible
    expect(screen.getByText("Sección")).toBeTruthy();
    expect(screen.getByText("Categoría")).toBeTruthy();
  });

  it("closes when Escape is pressed", () => {
    render(<QuickReclassify caso={caseFactory()} categories={categories} onPatch={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Cambiar sección/i }));
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("QuickReclassify — apply", () => {
  it("patches the section and strips 'Sin clasificar' tag", () => {
    const onPatch = vi.fn();
    const caso = caseFactory({
      id: "c-x",
      section: "atlas",
      tags: ["Sin clasificar", "POCUS"],
    });
    render(<QuickReclassify caso={caso} categories={categories} onPatch={onPatch} />);

    fireEvent.click(screen.getByRole("button", { name: /Cambiar sección/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /ECG/i }));

    expect(onPatch).toHaveBeenCalledWith("c-x", {
      section: "ecg",
      tags: ["POCUS"], // 'Sin clasificar' dropped
    });
  });

  it("patches the category and strips 'Sin clasificar' tag", () => {
    const onPatch = vi.fn();
    const caso = caseFactory({
      id: "c-y",
      category: "cardiac",
      tags: ["Sin clasificar", "Crítico"],
    });
    render(<QuickReclassify caso={caso} categories={categories} onPatch={onPatch} />);

    fireEvent.click(screen.getByRole("button", { name: /Cambiar sección/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Pulmonar/i }));

    expect(onPatch).toHaveBeenCalledWith("c-y", {
      category: "lung",
      tags: ["Crítico"],
    });
  });

  it("closes the popover after applying a value", () => {
    const onPatch = vi.fn();
    render(<QuickReclassify caso={caseFactory()} categories={categories} onPatch={onPatch} />);
    fireEvent.click(screen.getByRole("button", { name: /Cambiar sección/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Pediatría/i }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("marks the current section/category with the active checkmark", () => {
    render(
      <QuickReclassify
        caso={caseFactory({ section: "ecg", category: "cardiac" })}
        categories={categories}
        onPatch={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Cambiar sección/i }));

    const ecg = screen.getByRole("menuitemradio", { name: /ECG/i });
    expect(ecg.getAttribute("aria-checked")).toBe("true");

    const cardiac = screen.getByRole("menuitemradio", { name: /Cardíaco/i });
    expect(cardiac.getAttribute("aria-checked")).toBe("true");
  });
});
