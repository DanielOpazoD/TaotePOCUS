import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import {
  BulkEditTagsCell,
  BulkEditTagSuggestions,
} from "@/components/admin/bulk-edit/cells/TagsCell";

// The tags input has `list="..."` which makes it expose role="combobox"
// per the WAI-ARIA spec, not "textbox". `findByRole("combobox")` is
// the correct query.

describe("BulkEditTagsCell", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders chips for each tag in display mode", () => {
    render(<BulkEditTagsCell tags={["A", "B"]} onSave={vi.fn()} />);
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
  });

  it("shows the empty placeholder when no tags", () => {
    render(<BulkEditTagsCell tags={[]} onSave={vi.fn()} />);
    expect(screen.getByText("— sin etiquetas —")).toBeTruthy();
  });

  it("clicking the display button enters edit mode", async () => {
    render(<BulkEditTagsCell tags={["A"]} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar etiquetas" }));
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /Etiquetas separadas/ })).toBeTruthy();
    });
  });

  it("commits a parsed array on Enter", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<BulkEditTagsCell tags={["A"]} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button"));
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "X, Y, Z" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(["X", "Y", "Z"]));
  });

  it("trims whitespace and dedupes case-insensitively", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<BulkEditTagsCell tags={[]} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button"));
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "  apple , Apple , banana ,, APPLE " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(["apple", "banana"]));
  });

  it("does not call onSave when the parsed list equals the current tags", async () => {
    const onSave = vi.fn();
    render(<BulkEditTagsCell tags={["A", "B"]} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button"));
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "A, B" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Escape cancels and reverts the draft", async () => {
    const onSave = vi.fn();
    render(<BulkEditTagsCell tags={["A"]} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button"));
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "A, new" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("the input points at the shared datalist", async () => {
    render(<BulkEditTagsCell tags={["A"]} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    expect(input.getAttribute("list")).toBe("bulk-edit-tag-suggestions");
  });
});

describe("BulkEditTagSuggestions", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders a datalist with the COMMON_TAGS catalog", () => {
    const { container } = render(<BulkEditTagSuggestions />);
    const datalist = container.querySelector("datalist#bulk-edit-tag-suggestions");
    expect(datalist).not.toBeNull();
    expect(datalist!.querySelectorAll("option").length).toBeGreaterThan(0);
  });
});
