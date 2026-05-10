// Smoke test for the admin Focus tab. Confirms the panel renders the
// three scope sections (global / per-section / per-category) and that
// the FocusEditor inside each row pipes Save / Reset to the right
// callback.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import FocusDefaultsPanel from "@/components/admin/FocusDefaultsPanel";
import { CATEGORIES } from "@/lib/data";
import { renderWithLanguage as render } from "./test-utils";

const noopSetGlobal = vi.fn();
const noopSetSection = vi.fn();
const noopSetCategory = vi.fn();

function setup(extra: Partial<Parameters<typeof FocusDefaultsPanel>[0]> = {}) {
  return render(
    <FocusDefaultsPanel
      defaults={{}}
      categories={CATEGORIES}
      onSetGlobal={noopSetGlobal}
      onSetSection={noopSetSection}
      onSetCategory={noopSetCategory}
      {...extra}
    />,
  );
}

describe("FocusDefaultsPanel", () => {
  it("renders the three scope groups (global / sections / categories)", () => {
    setup();
    // Group labels — we use ES copy because the renderer defaults
    // `lang: "es"` in `renderWithLanguage`.
    expect(screen.getByText(/Global/)).toBeTruthy();
    expect(screen.getByText(/Por sección/)).toBeTruthy();
    expect(screen.getByText(/Por categoría/)).toBeTruthy();
  });

  it("renders a row per built-in section + per built-in category", () => {
    const { container } = setup();
    // 1 global row + 5 section rows + 8 built-in category rows = 14 row heads.
    const heads = container.querySelectorAll(".focus-defaults-row-head");
    expect(heads.length).toBeGreaterThanOrEqual(14);
  });

  it("expands the global row by default and lets the user save a draft", () => {
    const onSetGlobal = vi.fn();
    setup({ onSetGlobal });
    // Global is the first row and starts expanded — the editor's
    // "Guardar" button is present.
    const saveButtons = screen.getAllByRole("button", { name: "Guardar" });
    expect(saveButtons.length).toBeGreaterThan(0);
    // Saving with the default values yields `undefined` (slot cleared).
    fireEvent.click(saveButtons[0]!);
    expect(onSetGlobal).toHaveBeenCalledTimes(1);
    expect(onSetGlobal).toHaveBeenCalledWith(undefined);
  });

  it("displays the saved summary next to closed rows", () => {
    setup({
      defaults: {
        global: { scale: 1.5 },
      },
    });
    // The summary string includes the zoom percentage.
    expect(screen.getByText(/zoom 150%/)).toBeTruthy();
  });

  it("shows 'Reset todo' when onResetAll is provided", () => {
    const onResetAll = vi.fn();
    setup({ onResetAll });
    expect(screen.getByRole("button", { name: "Reset todo" })).toBeTruthy();
  });

  it("hides 'Reset todo' when onResetAll is omitted", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Reset todo" })).toBeNull();
  });
});
