import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import EmptyState from "@/components/EmptyState";
import { viewFactory } from "./fixtures";

describe("EmptyState", () => {
  it("renders the favs-specific heading on the favs view", () => {
    render(<EmptyState view={viewFactory.favs()} />);
    expect(screen.getByRole("heading", { name: /aún no has guardado/i })).toBeTruthy();
  });

  it("renders the section-specific heading for an unfiltered atlas", () => {
    render(<EmptyState view={viewFactory.section("atlas")} />);
    // Default copy points the user to filter / search.
    expect(screen.getByRole("heading", { name: /sin resultados/i })).toBeTruthy();
  });

  it("renders the ECG-flatline copy on the ecg empty state", () => {
    render(<EmptyState view={viewFactory.section("ecg")} />);
    expect(screen.getByRole("heading", { name: /trazado plano/i })).toBeTruthy();
  });

  it("renders the rayos-specific copy on the rayos empty state", () => {
    render(<EmptyState view={viewFactory.section("rayos")} />);
    expect(screen.getByRole("heading", { name: /sin estudios/i })).toBeTruthy();
  });

  it("renders the cases-specific copy on the cases empty state", () => {
    render(<EmptyState view={viewFactory.section("cases")} />);
    expect(screen.getByRole("heading", { name: /sin historias/i })).toBeTruthy();
  });

  it("renders the info-specific copy on the info empty state", () => {
    render(<EmptyState view={viewFactory.section("info")} />);
    expect(screen.getByRole("heading", { name: /sin infografías/i })).toBeTruthy();
  });

  it("uses the explicit title and message when provided", () => {
    render(
      <EmptyState
        view={viewFactory.section("atlas")}
        title="Custom title"
        message="Custom message"
      />,
    );
    expect(screen.getByRole("heading", { name: "Custom title" })).toBeTruthy();
    expect(screen.getByText("Custom message")).toBeTruthy();
  });

  it("renders the action button only when an action is provided", () => {
    const { rerender } = render(<EmptyState view={viewFactory.favs()} />);
    expect(screen.queryByRole("button")).toBeNull();
    const onClick = vi.fn();
    rerender(
      <EmptyState view={viewFactory.favs()} action={{ label: "Explorar el atlas", onClick }} />,
    );
    expect(screen.getByRole("button", { name: "Explorar el atlas" })).toBeTruthy();
  });

  it("invokes the action onClick when the CTA is clicked", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        view={viewFactory.section("atlas")}
        action={{ label: "Limpiar filtros", onClick }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("includes a decorative SVG glyph (aria-hidden)", () => {
    const { container } = render(<EmptyState view={viewFactory.section("info")} />);
    const svg = container.querySelector(".empty-svg");
    expect(svg).toBeTruthy();
    // The wrapper is aria-hidden — the heading carries the meaning.
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});
