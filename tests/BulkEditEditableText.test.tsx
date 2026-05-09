import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { BulkEditEditableText } from "@/components/admin/bulk-edit/cells/EditableText";
import { renderWithLanguage as render } from "./test-utils";

describe("BulkEditEditableText", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders the value as a clickable display button by default", () => {
    render(<BulkEditEditableText value="Hello" ariaLabel="Title" onSave={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /Title \(click para editar\)/ });
    expect(btn.textContent).toBe("Hello");
  });

  it("renders an empty placeholder when value is empty", () => {
    render(<BulkEditEditableText value="" ariaLabel="Description" onSave={vi.fn()} />);
    expect(screen.getByText("— vacío —")).toBeTruthy();
  });

  it("enters edit mode when the display button is clicked (single-line)", () => {
    render(<BulkEditEditableText value="Hello" ariaLabel="Title" onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
  });

  it("commits on Enter for single-line input and calls onSave with new value", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<BulkEditEditableText value="old" ariaLabel="Title" onSave={onSave} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "new value" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("new value"));
  });

  it("does not call onSave when value is unchanged on commit", () => {
    const onSave = vi.fn();
    render(<BulkEditEditableText value="hello" ariaLabel="Title" onSave={onSave} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Escape cancels and reverts to display mode without calling onSave", () => {
    const onSave = vi.fn();
    render(<BulkEditEditableText value="hello" ariaLabel="Title" onSave={onSave} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button").textContent).toBe("hello");
  });

  it("renders a textarea when multiline is true", () => {
    render(<BulkEditEditableText value="x" ariaLabel="Body" multiline onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const textarea = screen.getByRole("textbox", { name: "Body" });
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("plain Enter on multiline does NOT commit (allows newline)", () => {
    const onSave = vi.fn();
    render(<BulkEditEditableText value="x" ariaLabel="Body" multiline onSave={onSave} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Cmd+Enter on multiline commits with new value", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<BulkEditEditableText value="x" ariaLabel="Body" multiline onSave={onSave} />);
    fireEvent.click(screen.getByRole("button"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "y" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("y"));
  });

  it("syncs draft when external value changes while not editing", () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <BulkEditEditableText value="old" ariaLabel="Title" onSave={onSave} />,
    );
    rerender(<BulkEditEditableText value="fresh" ariaLabel="Title" onSave={onSave} />);
    expect(screen.getByRole("button").textContent).toBe("fresh");
  });
});
