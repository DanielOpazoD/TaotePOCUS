import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ConfirmDialog from "@/components/modals/ConfirmDialog";

describe("ConfirmDialog", () => {
  const baseProps = {
    open: true,
    title: "¿Eliminar caso?",
    message: "Esta acción no se puede deshacer.",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it("keeps the dialog closed when open=false", () => {
    // Native <dialog> stays in the DOM; closed state means
    // `.open === false` and the role is not exposed to a11y tree.
    const { container } = render(<ConfirmDialog {...baseProps} open={false} />);
    const dialog = container.querySelector("dialog");
    expect(dialog).toBeTruthy();
    expect((dialog as HTMLDialogElement).open).toBe(false);
  });

  it("renders title, message, and both buttons", () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("¿Eliminar caso?")).toBeTruthy();
    expect(screen.getByText("Esta acción no se puede deshacer.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeTruthy();
  });

  it("uses the destructive label when destructive is true", () => {
    render(
      <ConfirmDialog {...baseProps} destructive confirmLabel="Eliminar" cancelLabel="Cancelar" />,
    );
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeTruthy();
  });

  it("invokes onConfirm when the primary button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("invokes onCancel when the cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("invokes onCancel on Escape", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("invokes onConfirm on Enter", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("links the message via aria-describedby", () => {
    render(<ConfirmDialog {...baseProps} />);
    const dialog = screen.getByRole("alertdialog");
    const id = dialog.getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    const desc = document.getElementById(id!);
    expect(desc?.textContent).toMatch(/Esta acción/);
  });
});
