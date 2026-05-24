import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import CaseCard from "@/components/cards/CaseCard";
import { caseFactory } from "./fixtures";
import { renderWithLanguage as render } from "./test-utils";

// CineLoop ships a canvas + RAF that hurts test perf and isn't what
// we're testing here. Stub it.
vi.mock("../components/cine", () => ({
  __esModule: true,
  CineLoop: () => <div data-testid="cine-loop-stub" />,
}));

// Built once with the fields these tests assert on; deeper overrides
// flow through the factory at the call site.
const baseCase = caseFactory({
  id: "c-test",
  title: "B-líneas confluentes en edema agudo",
  category: "lung",
  tags: ["B-líneas", "Patológico", "Crítico"],
  modality: "Sonda lineal · 5 MHz",
  author: "Dra. Test",
  role: "Medicina",
  date: "2026-04-18",
  description: "Hallazgos de prueba: imagen sospechosa.",
});

describe("CaseCard", () => {
  it("renders the case title, byline and tags", () => {
    render(<CaseCard caso={baseCase} isFav={false} onFav={vi.fn()} onOpen={vi.fn()} />);
    // Default render is in Spanish; the title resolves to the ES slot.
    expect(screen.getByText(baseCase.title.es)).toBeTruthy();
    // The small category icon+label under the thumbnail was removed
    // in May-2026 — inside a section view the category was redundant
    // with the URL (e.g. everything under /pulmonary is pulmonary)
    // and the chip drew the eye away from the title. The category
    // still drives filters; only the per-card visual was cut.
    expect(screen.queryByText("Pulmonar")).toBeNull();
    expect(screen.getByText(baseCase.author)).toBeTruthy();
    expect(screen.getByText("B-líneas")).toBeTruthy();
    // "Crítico" was demoted in May-2026 — the red pulsing badge was
    // removed (see cards.css), and the tag is no longer in COMMON_TAGS.
    // It still renders as a regular chip if it lives in `caso.tags`.
    expect(screen.getAllByText("Crítico").length).toBe(1);
  });

  it("does NOT render the legacy 'Crítico' red badge anymore", () => {
    const { container } = render(
      <CaseCard caso={baseCase} isFav={false} onFav={vi.fn()} onOpen={vi.fn()} />,
    );
    // The chip survives (it's a regular .case-tag-mini); the badge
    // class doesn't.
    expect(container.querySelector(".case-thumb-crit")).toBeNull();
  });

  it("invokes onOpen when the title link is clicked", () => {
    // Anchor-cover pattern (May-2026): the card is an `<article>` and
    // the open-case surface is a real `<a href="?caso=…">` inside the
    // h2 title. Clicking the link bubbles through `handleAnchorClick`,
    // which preventDefault()s the navigation and invokes `onOpen`.
    const onOpen = vi.fn();
    render(<CaseCard caso={baseCase} isFav={false} onFav={vi.fn()} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("link", { name: /B-líneas confluentes/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("uses a real ?caso= href on the title link so copy-link / new-tab work", () => {
    // The anchor-cover pattern preserves the option of opening the
    // case in a new tab (Cmd-click / Ctrl-click). That ONLY works
    // when the anchor has a real `href` the browser can follow —
    // verify the URL shape stays stable for shareability.
    render(<CaseCard caso={baseCase} isFav={false} onFav={vi.fn()} onOpen={vi.fn()} />);
    const link = screen.getByRole("link", { name: /B-líneas confluentes/ }) as HTMLAnchorElement;
    // jsdom normalizes the href against the document base URL — match
    // the search-param suffix rather than the absolute string.
    expect(link.getAttribute("href")).toBe("?caso=c-test");
  });

  it("does NOT invoke onOpen on a modifier-key click (so Cmd/Ctrl-click open in a new tab)", () => {
    // Modifier-key clicks must fall through to the browser's native
    // anchor behavior — preserves the power-user feature the prior
    // `<div role="button">` could never offer.
    const onOpen = vi.fn();
    render(<CaseCard caso={baseCase} isFav={false} onFav={vi.fn()} onOpen={onOpen} />);
    const link = screen.getByRole("link", { name: /B-líneas confluentes/ });
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { shiftKey: true });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("invokes onOpen on Enter when the title link is focused", () => {
    // Native anchors activate on Enter (the browser fires a synthetic
    // click). happy-dom doesn't perform that translation, so we fire
    // the click directly to mirror the post-translation event — the
    // assertion is that handleOpen gets called once per activation.
    const onOpen = vi.fn();
    render(<CaseCard caso={baseCase} isFav={false} onFav={vi.fn()} onOpen={onOpen} />);
    const link = screen.getByRole("link", { name: /B-líneas confluentes/ });
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("invokes onOpen on Space when the title link is focused", () => {
    // Native anchors don't activate on Space; we re-bind that key on
    // the link so the prior `<div role="button">` muscle memory is
    // preserved post-refactor.
    const onOpen = vi.fn();
    render(<CaseCard caso={baseCase} isFav={false} onFav={vi.fn()} onOpen={onOpen} />);
    const link = screen.getByRole("link", { name: /B-líneas confluentes/ });
    fireEvent.keyDown(link, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(1);
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
      tags: { es: ["one", "two", "three", "four", "five"] },
    };
    render(<CaseCard caso={many} isFav={false} onFav={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText("one")).toBeTruthy();
    expect(screen.getByText("three")).toBeTruthy();
    // The fourth and fifth tags should not appear.
    expect(screen.queryByText("four")).toBeNull();
    expect(screen.queryByText("five")).toBeNull();
  });
});
