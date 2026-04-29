import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import QuoteCard from "@/components/cards/QuoteCard";
import { caseFactory } from "./fixtures";

describe("QuoteCard", () => {
  it("renders the case author + category in the byline", () => {
    const c = caseFactory({
      author: "Dr. M. Ramírez",
      category: "lung",
    });
    render(<QuoteCard caso={c} onOpen={() => {}} />);
    expect(screen.getByText("Dr. M. Ramírez")).toBeTruthy();
    expect(screen.getByText("Pulmonar")).toBeTruthy();
  });

  it("uses the first sentence of `findings` as the fragment", () => {
    const c = caseFactory({
      findings: "Patrón B confluente bilateral con engrosamiento pleural. Más detalles después.",
      summary: "Resumen corto",
    });
    render(<QuoteCard caso={c} onOpen={() => {}} />);
    // Pulled from findings, ends with period.
    expect(
      screen.getByText(/Patrón B confluente bilateral con engrosamiento pleural\./),
    ).toBeTruthy();
  });

  it("falls back to summary when findings is too short", () => {
    const c = caseFactory({
      findings: "Corto.",
      summary: "Resumen completo. Que tiene varias oraciones interesantes.",
    });
    render(<QuoteCard caso={c} onOpen={() => {}} />);
    expect(screen.getByText(/Resumen completo\./)).toBeTruthy();
  });

  it("truncates fragments longer than 140 chars with an ellipsis", () => {
    const long = "A".repeat(160);
    const c = caseFactory({
      findings: `${long}. Después.`,
      summary: "x",
    });
    const { container } = render(<QuoteCard caso={c} onOpen={() => {}} />);
    // The fragment lives inside .quote-card-text; we assert directly
    // on its text rather than trying to match through the whole tree.
    const text = container.querySelector(".quote-card-text");
    expect(text?.textContent).toMatch(/…$/);
    expect(text?.textContent?.length).toBe(138); // 137 chars + ellipsis
  });

  it("invokes onOpen on click", () => {
    const onOpen = vi.fn();
    render(<QuoteCard caso={caseFactory()} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("invokes onOpen on Enter and Space keypresses", () => {
    const onOpen = vi.fn();
    render(<QuoteCard caso={caseFactory()} onOpen={onOpen} />);
    const card = screen.getByRole("button");
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("ignores other keypresses (no accidental opens on Tab/Esc)", () => {
    const onOpen = vi.fn();
    render(<QuoteCard caso={caseFactory()} onOpen={onOpen} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Tab" });
    fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("includes the title in aria-label so screen readers know what opens", () => {
    const c = caseFactory({ title: "B-líneas confluentes en edema pulmonar" });
    render(<QuoteCard caso={c} onOpen={() => {}} />);
    const card = screen.getByRole("button");
    expect(card.getAttribute("aria-label")).toContain("B-líneas confluentes en edema pulmonar");
  });
});
