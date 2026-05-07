import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { BulkEditSortHeader } from "@/components/admin/bulk-edit/cells/SortHeader";

describe("BulkEditSortHeader", () => {
  beforeEach(() => {
    cleanup();
  });

  function renderHeader(
    overrides: Partial<{
      field: "title" | "description" | "category" | "reviewed";
      active: boolean;
      dir: "asc" | "desc";
      onClick: (f: "title" | "description" | "category" | "reviewed") => void;
    }> = {},
  ) {
    const onClick = overrides.onClick ?? vi.fn();
    const field = overrides.field ?? "title";
    const active = overrides.active ?? false;
    const dir = overrides.dir ?? "asc";
    const result = render(
      <table>
        <thead>
          <tr>
            <BulkEditSortHeader field={field} active={active} dir={dir} onClick={onClick}>
              Título
            </BulkEditSortHeader>
          </tr>
        </thead>
      </table>,
    );
    return { ...result, onClick };
  }

  it("renders the children inside a button", () => {
    const { getByRole } = renderHeader();
    expect(getByRole("button").textContent).toContain("Título");
  });

  it("shows no arrow when inactive", () => {
    const { container } = renderHeader({ active: false });
    const arrow = container.querySelector(".bulk-edit-sort-arrow");
    expect(arrow?.textContent).toBe("");
  });

  it("shows ↑ when active and asc", () => {
    const { container } = renderHeader({ active: true, dir: "asc" });
    const arrow = container.querySelector(".bulk-edit-sort-arrow");
    expect(arrow?.textContent).toBe("↑");
  });

  it("shows ↓ when active and desc", () => {
    const { container } = renderHeader({ active: true, dir: "desc" });
    const arrow = container.querySelector(".bulk-edit-sort-arrow");
    expect(arrow?.textContent).toBe("↓");
  });

  it("calls onClick with the field id", () => {
    const onClick = vi.fn();
    const { getByRole } = renderHeader({ field: "category", onClick });
    fireEvent.click(getByRole("button"));
    expect(onClick).toHaveBeenCalledWith("category");
  });

  it("aria-sort reflects the active dir", () => {
    const { getByRole, rerender } = renderHeader({ active: true, dir: "asc" });
    expect(getByRole("button").getAttribute("aria-sort")).toBe("ascending");
    rerender(
      <table>
        <thead>
          <tr>
            <BulkEditSortHeader field="title" active dir="desc" onClick={vi.fn()}>
              Título
            </BulkEditSortHeader>
          </tr>
        </thead>
      </table>,
    );
    expect(getByRole("button").getAttribute("aria-sort")).toBe("descending");
  });

  it("aria-sort is 'none' when inactive", () => {
    const { getByRole } = renderHeader({ active: false });
    expect(getByRole("button").getAttribute("aria-sort")).toBe("none");
  });

  it("applies an is-active class when active", () => {
    const { getByRole } = renderHeader({ active: true });
    expect(getByRole("button").className).toContain("is-active");
  });
});
