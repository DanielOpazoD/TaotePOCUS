import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Sidebar from "@/components/Sidebar";
import type { CategoryWithCount } from "@/lib/types";

const cats: CategoryWithCount[] = [
  { id: "cardiac", label: "Cardíaco", count: 3 },
  { id: "lung", label: "Pulmonar", count: 5 },
  { id: "abdominal", label: "Abdominal", count: 2 },
];

const baseProps = {
  activeCat: null as null,
  setActiveCat: vi.fn(),
  activeTags: [] as string[],
  toggleTag: vi.fn(),
  totalCount: 10,
  categories: cats,
  tags: ["Crítico", "Patológico", "B-líneas"],
  collapsed: false,
  onToggleCollapsed: vi.fn(),
};

describe("Sidebar", () => {
  it("renders the 'Todos' button with the total count", () => {
    render(<Sidebar {...baseProps} />);
    const todos = screen.getByRole("button", { name: /Todos/ });
    expect(todos.textContent).toContain("10");
    expect(todos.className).toMatch(/active/);
  });

  it("renders one button per category with its label and count", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByRole("button", { name: /Cardíaco 3/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pulmonar 5/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Abdominal 2/ })).toBeTruthy();
  });

  it("highlights the active category and not the others", () => {
    render(<Sidebar {...baseProps} activeCat="lung" />);
    const lung = screen.getByRole("button", { name: /Pulmonar/ });
    const cardiac = screen.getByRole("button", { name: /Cardíaco/ });
    const todos = screen.getByRole("button", { name: /Todos/ });
    expect(lung.className).toMatch(/active/);
    expect(cardiac.className).not.toMatch(/active/);
    expect(todos.className).not.toMatch(/active/);
  });

  it("calls setActiveCat with the category id when clicked", () => {
    const setActiveCat = vi.fn();
    render(<Sidebar {...baseProps} setActiveCat={setActiveCat} />);
    fireEvent.click(screen.getByRole("button", { name: /Cardíaco/ }));
    expect(setActiveCat).toHaveBeenCalledWith("cardiac");
  });

  it("calls setActiveCat(null) when 'Todos' is clicked", () => {
    const setActiveCat = vi.fn();
    render(<Sidebar {...baseProps} activeCat="lung" setActiveCat={setActiveCat} />);
    fireEvent.click(screen.getByRole("button", { name: /Todos/ }));
    expect(setActiveCat).toHaveBeenCalledWith(null);
  });

  it("shows up to 14 tag chips", () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag-${i}`);
    render(<Sidebar {...baseProps} tags={many} />);
    const chips = screen.getAllByRole("button", { name: /^tag-/ });
    expect(chips).toHaveLength(14);
  });

  it("marks active tags and toggles on click", () => {
    const toggleTag = vi.fn();
    render(<Sidebar {...baseProps} activeTags={["Crítico"]} toggleTag={toggleTag} />);
    const critico = screen.getByRole("button", { name: "Crítico" });
    expect(critico.className).toMatch(/active/);
    fireEvent.click(critico);
    expect(toggleTag).toHaveBeenCalledWith("Crítico");
  });

  it("collapses the tag cloud when the section header is clicked", () => {
    render(<Sidebar {...baseProps} />);
    // Default open — chips visible.
    expect(screen.getByRole("button", { name: "Crítico" })).toBeTruthy();
    const sectionHeader = screen.getByRole("button", { name: /Etiquetas/ });
    fireEvent.click(sectionHeader);
    // After collapsing, the chips are removed from the DOM.
    expect(screen.queryByRole("button", { name: "Crítico" })).toBeNull();
  });

  it("force-opens the tag cloud when at least one tag is active", () => {
    // Start with the persisted "closed" preference.
    localStorage.setItem("sidebarTagsOpen", "0");
    render(<Sidebar {...baseProps} activeTags={["Crítico"]} />);
    // The chip is still visible because active tags override the
    // collapsed preference — otherwise the active filter is invisible.
    expect(screen.getByRole("button", { name: "Crítico" })).toBeTruthy();
    localStorage.removeItem("sidebarTagsOpen");
  });
});
