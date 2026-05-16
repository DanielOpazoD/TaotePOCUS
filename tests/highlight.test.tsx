// Tests for `lib/highlight.tsx`. The function wraps query matches
// inside the source text in `<mark className="search-match">` so the
// grid cards + case modal can show WHY a result landed. Pin the
// contract here so the diacritic-folding + regex-escape behavior
// can't drift unobserved.

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { highlight } from "@/lib/highlight";

/** Render the highlight output inside a paragraph and return the
 *  list of <mark> elements (in document order) + the rendered text. */
function renderHighlight(text: string, query: string) {
  const { container } = render(<p>{highlight(text, query)}</p>);
  const marks = Array.from(container.querySelectorAll("mark"));
  return { container, marks, text: container.textContent ?? "" };
}

describe("highlight", () => {
  it("returns the original text untouched when the query is empty", () => {
    const { marks, text } = renderHighlight("Cardíaco patológico", "");
    expect(marks).toHaveLength(0);
    expect(text).toBe("Cardíaco patológico");
  });

  it("wraps a simple substring match in <mark className='search-match'>", () => {
    const { marks, text } = renderHighlight("Tamponade pericárdico", "tampon");
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe("Tampon");
    expect(marks[0]!.className).toBe("search-match");
    // Surrounding source preserved verbatim.
    expect(text).toBe("Tamponade pericárdico");
  });

  it("matches case-insensitively but preserves the source casing", () => {
    const { marks } = renderHighlight("STEMI inferior", "stemi");
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe("STEMI");
  });

  it("folds diacritics — query without accents matches accented text", () => {
    // "lineas" (ascii) should match "líneas" (Spanish) — same fold
    // policy the filter pipeline applies.
    const { marks } = renderHighlight("B-líneas pulmonares", "lineas");
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe("líneas");
  });

  it("highlights every occurrence, not just the first", () => {
    const { marks } = renderHighlight("foo bar foo baz foo", "foo");
    expect(marks).toHaveLength(3);
    marks.forEach((m) => expect(m.textContent).toBe("foo"));
  });

  it("escapes regex metacharacters so a query like '(b)' doesn't blow up", () => {
    // Without escaping, `(b)` is a capture group and the matcher
    // throws or matches the wrong thing. The function should handle
    // it as a literal substring.
    const { marks } = renderHighlight("uso (b) en eco", "(b)");
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe("(b)");
  });

  it("returns the source untouched when no part matches", () => {
    const { marks, text } = renderHighlight("Cardíaco patológico", "xyz");
    expect(marks).toHaveLength(0);
    expect(text).toBe("Cardíaco patológico");
  });

  it("trims whitespace-only queries to a no-op", () => {
    // `query.trim()` is the first check in `highlight`. A whitespace
    // query shouldn't generate a regex that matches every gap.
    const { marks, text } = renderHighlight("foo bar", "   ");
    expect(marks).toHaveLength(0);
    expect(text).toBe("foo bar");
  });
});
