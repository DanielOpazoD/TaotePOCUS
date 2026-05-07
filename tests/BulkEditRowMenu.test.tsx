import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { BulkEditRowMenu } from "@/components/admin/bulk-edit/cells/RowMenu";
import { caseFactory } from "./fixtures";

describe("BulkEditRowMenu", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders nothing when no callbacks provided", () => {
    const { container } = render(<BulkEditRowMenu caso={caseFactory()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the trigger button when at least one callback is provided", () => {
    render(<BulkEditRowMenu caso={caseFactory()} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Más acciones" })).toBeTruthy();
  });

  it("toggles the menu open / closed on trigger click", () => {
    render(<BulkEditRowMenu caso={caseFactory()} onDelete={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Más acciones" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("only renders 'Eliminar caso' when onDelete is provided", () => {
    render(<BulkEditRowMenu caso={caseFactory()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    expect(screen.getByRole("menuitem", { name: "Eliminar caso" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Abrir modal completo" })).toBeNull();
  });

  it("only renders 'Abrir modal completo' when onOpenEdit is provided", () => {
    render(<BulkEditRowMenu caso={caseFactory()} onOpenEdit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    expect(screen.getByRole("menuitem", { name: "Abrir modal completo" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Eliminar caso" })).toBeNull();
  });

  it("calls onOpenEdit with the case and closes the menu", () => {
    const onOpenEdit = vi.fn();
    const c = caseFactory({ id: "c042" });
    render(<BulkEditRowMenu caso={c} onOpenEdit={onOpenEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Abrir modal completo" }));
    expect(onOpenEdit).toHaveBeenCalledWith(c);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("calls onDelete with the case and closes the menu", () => {
    const onDelete = vi.fn();
    const c = caseFactory({ id: "c042" });
    render(<BulkEditRowMenu caso={c} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar caso" }));
    expect(onDelete).toHaveBeenCalledWith(c);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape closes the menu", () => {
    render(<BulkEditRowMenu caso={caseFactory()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("clicking outside the menu closes it", () => {
    render(
      <div>
        <BulkEditRowMenu caso={caseFactory()} onDelete={vi.fn()} />
        <div data-testid="outside">elsewhere</div>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("clicking inside the menu does NOT close it", () => {
    render(<BulkEditRowMenu caso={caseFactory()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    const menu = screen.getByRole("menu");
    fireEvent.mouseDown(menu);
    expect(screen.getByRole("menu")).toBeTruthy();
  });
});
