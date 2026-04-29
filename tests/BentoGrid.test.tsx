import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import BentoGrid from "@/components/cards/BentoGrid";
import { caseFactory, resetIdCounter } from "./fixtures";

// happy-dom doesn't implement HTMLCanvasElement.getContext — the
// CineLoop inside CaseCard renders a canvas and tries to draw to it.
// We stub a minimal context so the component mounts without throwing.
function stubCanvas() {
  // @ts-expect-error — narrow stub for tests only.
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      globalAlpha: 1,
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      fillText: vi.fn(),
      measureText: () => ({ width: 0 }),
    };
  };
}

describe("BentoGrid", () => {
  beforeEach(() => {
    resetIdCounter();
    stubCanvas();
  });

  it("renders nothing when the case list is empty", () => {
    const { container } = render(
      <BentoGrid cases={[]} favs={[]} onOpen={() => {}} onFav={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("promotes the first featured case to the bento hero slot", () => {
    const cases = [
      caseFactory({ id: "regular", title: "Regular case", featured: false }),
      caseFactory({ id: "hero", title: "The hero", featured: true }),
      caseFactory({ id: "second-featured", title: "Second", featured: true }),
    ];
    const { container } = render(
      <BentoGrid cases={cases} favs={[]} onOpen={() => {}} onFav={() => {}} />,
    );
    const heroSlot = container.querySelector(".bento-hero");
    expect(heroSlot).toBeTruthy();
    // The hero slot contains exactly one card whose title matches.
    expect(heroSlot?.textContent).toContain("The hero");
  });

  it("falls back to the first case when none are featured", () => {
    const cases = [
      caseFactory({ id: "first", title: "First-in-list" }),
      caseFactory({ id: "second", title: "Second" }),
    ];
    const { container } = render(
      <BentoGrid cases={cases} favs={[]} onOpen={() => {}} onFav={() => {}} />,
    );
    expect(container.querySelector(".bento-hero")?.textContent).toContain("First-in-list");
  });

  it("renders quote cards for the next 2 featured cases (after the hero)", () => {
    // The bento interleaves quotes after the 2nd and 5th rest items,
    // so we need at least 5 non-featured rest items for the second
    // quote slot to fire.
    const cases = [
      caseFactory({ id: "hero", title: "Hero", featured: true }),
      caseFactory({ id: "rest-1", title: "Rest 1" }),
      caseFactory({ id: "rest-2", title: "Rest 2" }),
      caseFactory({ id: "rest-3", title: "Rest 3" }),
      caseFactory({ id: "rest-4", title: "Rest 4" }),
      caseFactory({ id: "rest-5", title: "Rest 5" }),
      caseFactory({ id: "quote-1", title: "Quote one", featured: true }),
      caseFactory({ id: "quote-2", title: "Quote two", featured: true }),
    ];
    const { container } = render(
      <BentoGrid cases={cases} favs={[]} onOpen={() => {}} onFav={() => {}} />,
    );
    const quoteCards = container.querySelectorAll(".quote-card");
    expect(quoteCards).toHaveLength(2);
    // QuoteCard renders the findings/summary fragment, not the title;
    // the title is accessible via aria-label so screen readers know
    // what the card opens. Assert on that.
    const labels = Array.from(quoteCards).map((q) => q.getAttribute("aria-label") ?? "");
    expect(labels.some((l) => l.includes("Quote one"))).toBe(true);
    expect(labels.some((l) => l.includes("Quote two"))).toBe(true);
  });

  it("renders the rest of the cases as standard CaseCards", () => {
    const cases = [
      caseFactory({ id: "hero", title: "Hero", featured: true }),
      caseFactory({ id: "a", title: "Alpha" }),
      caseFactory({ id: "b", title: "Beta" }),
      caseFactory({ id: "c", title: "Gamma" }),
    ];
    const { container } = render(
      <BentoGrid cases={cases} favs={[]} onOpen={() => {}} onFav={() => {}} />,
    );
    // 3 standard cards + 1 hero CaseCard = 4 case-card nodes total.
    const caseCards = container.querySelectorAll(".case-card");
    expect(caseCards.length).toBe(4);
  });

  it("invokes onOpen with the right case when a card is clicked", () => {
    const onOpen = vi.fn();
    const cases = [
      caseFactory({ id: "h", title: "Hero", featured: true }),
      caseFactory({ id: "x", title: "X" }),
    ];
    render(<BentoGrid cases={cases} favs={[]} onOpen={onOpen} onFav={() => {}} />);
    fireEvent.click(screen.getByText("X"));
    expect(onOpen).toHaveBeenCalled();
    // The fav callback receives the case object — verify shape.
    expect(onOpen.mock.calls[0]?.[0]).toMatchObject({ id: "x" });
  });
});
