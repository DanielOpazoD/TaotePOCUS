import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CaseCard from "@/components/cards/CaseCard";
import type { CaseRecord } from "@/lib/types";

// CineLoop ships a canvas + RAF that hurts test perf and isn't what
// we're testing here. Stub it.
vi.mock("../components/cine", () => ({
  __esModule: true,
  CineLoop: () => <div data-testid="cine-loop-stub" />,
}));

const baseCase: CaseRecord = {
  id: "c-test",
  section: "atlas",
  title: "B-líneas confluentes en edema agudo",
  category: "lung",
  tags: ["B-líneas", "Patológico", "Crítico"],
  modality: "Sonda lineal · 5 MHz",
  loop: "blines",
  author: "Dra. Test",
  role: "Medicina",
  date: "2026-04-18",
  findings: "Hallazgos de prueba.",
  diagnosis: "Diagnóstico de prueba",
  summary: "Resumen breve.",
};

describe("CaseCard", () => {
  it("renders the case title, category, byline and tags", () => {
    render(<CaseCard caso={baseCase} isFav={false} onFav={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText(baseCase.title)).toBeTruthy();
    expect(screen.getByText("Pulmonar")).toBeTruthy(); // category label
    expect(screen.getByText(baseCase.author)).toBeTruthy();
    expect(screen.getByText("B-líneas")).toBeTruthy();
    // "Crítico" appears twice on purpose (badge + chip) — the next test
    // pins that. Here we just confirm at least one rendering exists.
    expect(screen.getAllByText("Crítico").length).toBeGreaterThan(0);
  });

  it("shows the Crítico badge when the tag is present", () => {
    render(<CaseCard caso={baseCase} isFav={false} onFav={vi.fn()} onOpen={vi.fn()} />);
    // The chip label and the badge both read "Crítico" — make sure
    // both are present (chip from .case-tag-mini, badge from .case-thumb-crit).
    const crits = screen.getAllByText(/Crítico/);
    expect(crits.length).toBeGreaterThanOrEqual(2);
  });

  it("invokes onOpen when the card is clicked", () => {
    const onOpen = vi.fn();
    render(<CaseCard caso={baseCase} isFav={false} onFav={vi.fn()} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /B-líneas confluentes/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("invokes onOpen on Enter and Space when card is focused", () => {
    const onOpen = vi.fn();
    render(<CaseCard caso={baseCase} isFav={false} onFav={vi.fn()} onOpen={onOpen} />);
    const card = screen.getByRole("button", { name: /B-líneas confluentes/ });
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("invokes onFav when the heart button is clicked, without triggering onOpen", () => {
    const onFav = vi.fn();
    const onOpen = vi.fn();
    render(<CaseCard caso={baseCase} isFav={false} onFav={onFav} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Favorito" }));
    expect(onFav).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("reflects the favorite state on the button class", () => {
    const { rerender } = render(
      <CaseCard caso={baseCase} isFav={false} onFav={vi.fn()} onOpen={vi.fn()} />,
    );
    const btn = screen.getByRole("button", { name: "Favorito" });
    expect(btn.className).not.toMatch(/active/);
    rerender(<CaseCard caso={baseCase} isFav onFav={vi.fn()} onOpen={vi.fn()} />);
    expect(btn.className).toMatch(/active/);
  });

  it("limits visible tags to 3", () => {
    const many = {
      ...baseCase,
      tags: ["one", "two", "three", "four", "five"],
    };
    render(<CaseCard caso={many} isFav={false} onFav={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText("one")).toBeTruthy();
    expect(screen.getByText("three")).toBeTruthy();
    // The fourth and fifth tags should not appear.
    expect(screen.queryByText("four")).toBeNull();
    expect(screen.queryByText("five")).toBeNull();
  });
});
