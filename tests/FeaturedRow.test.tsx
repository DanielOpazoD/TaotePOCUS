import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import FeaturedRow from "@/components/cards/FeaturedRow";
import { caseFactory } from "./fixtures";
import { renderWithLanguage as render } from "./test-utils";

vi.mock("../components/cine", () => ({
  __esModule: true,
  CineLoop: () => <div data-testid="cine-stub" />,
}));

// Tighter than the factory default so the FeaturedRow assertions
// (titles, summaries) stay deterministic. Writes the abstract via
// the canonical `description` field so the assertion matches what
// the post-May-2026 read path resolves. Use overrides liberally.
const baseCase = (overrides: Partial<Parameters<typeof caseFactory>[0]> = {}) =>
  caseFactory({
    title: "Title",
    category: "cardiac",
    tags: [],
    description: "Summary text",
    ...overrides,
  });

describe("FeaturedRow", () => {
  it("returns null when there are no featured cases", () => {
    const { container } = render(
      <FeaturedRow cases={[baseCase({ id: "a" })]} favs={[]} onOpen={vi.fn()} onFav={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders only the hero when one case is featured", () => {
    render(
      <FeaturedRow
        cases={[
          baseCase({ id: "hero", title: "Hero", featured: true }),
          baseCase({ id: "regular", title: "Regular" }),
        ]}
        favs={[]}
        onOpen={vi.fn()}
        onFav={vi.fn()}
      />,
    );
    expect(screen.getByText("Hero")).toBeTruthy();
    expect(screen.queryByText("Regular")).toBeNull();
    // Hero shows abstract; side cards do not.
    expect(screen.getByText("Summary text")).toBeTruthy();
  });

  it("renders hero + side stack (up to 3 featured)", () => {
    render(
      <FeaturedRow
        cases={[
          baseCase({ id: "h", title: "Hero", featured: true }),
          baseCase({ id: "s1", title: "Side 1", featured: true }),
          baseCase({ id: "s2", title: "Side 2", featured: true }),
          baseCase({ id: "s3", title: "Should be ignored", featured: true }),
        ]}
        favs={[]}
        onOpen={vi.fn()}
        onFav={vi.fn()}
      />,
    );
    expect(screen.getByText("Hero")).toBeTruthy();
    expect(screen.getByText("Side 1")).toBeTruthy();
    expect(screen.getByText("Side 2")).toBeTruthy();
    expect(screen.queryByText("Should be ignored")).toBeNull();
  });

  it("invokes onOpen when the title link is clicked", () => {
    // Anchor-cover refactor (May-2026): the card is now an
    // `<article>` and the open-case surface is a real `<a>` inside
    // the title. Same shape as `CaseCard`.
    const onOpen = vi.fn();
    render(
      <FeaturedRow
        cases={[baseCase({ id: "h", title: "Hero", featured: true })]}
        favs={[]}
        onOpen={onOpen}
        onFav={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("link", { name: /Hero/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "h" }));
  });

  it("favorite click calls onFav and not onOpen", () => {
    const onOpen = vi.fn();
    const onFav = vi.fn();
    render(
      <FeaturedRow
        cases={[baseCase({ id: "h", title: "Hero", featured: true })]}
        favs={[]}
        onOpen={onOpen}
        onFav={onFav}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Favorito" }));
    expect(onFav).toHaveBeenCalledWith("h");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("shows the Destacados header", () => {
    render(
      <FeaturedRow
        cases={[baseCase({ id: "h", title: "Hero", featured: true })]}
        favs={[]}
        onOpen={vi.fn()}
        onFav={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Destacados" })).toBeTruthy();
  });
});
