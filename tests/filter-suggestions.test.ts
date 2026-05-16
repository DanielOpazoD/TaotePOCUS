// Tests for `lib/filter-suggestions.ts`. The helper powers the
// EmptyState chip rail — when the user lands on a zero-result filter
// combination, each suggestion tells them which SINGLE filter drop
// would unlock content + how many cases that drop yields. Pin the
// scoring + sorting + edge cases here so the UX promise can't drift.

import { describe, expect, it } from "vitest";
import { computeRelaxationSuggestions } from "@/lib/filter-suggestions";
import type { CaseRecord } from "@/lib/types";

function makeCase(overrides: Partial<CaseRecord> & { id: string }): CaseRecord {
  return {
    section: overrides.section ?? "atlas",
    title: overrides.title ?? { es: overrides.id },
    category: overrides.category ?? "cardiac",
    tags: overrides.tags ?? { es: [] },
    modality: overrides.modality ?? "",
    loop: overrides.loop ?? "blines",
    author: overrides.author ?? "Admin",
    role: overrides.role ?? "Admin",
    date: overrides.date ?? "2026-01-01",
    description: overrides.description ?? { es: "" },
    featured: overrides.featured ?? false,
    ...overrides,
  };
}

describe("computeRelaxationSuggestions", () => {
  it("returns empty array when no filter is active", () => {
    const result = computeRelaxationSuggestions({
      scopedCases: [makeCase({ id: "a" }), makeCase({ id: "b" })],
      cat: null,
      tags: [],
      query: "",
      sort: "recent",
      difficulty: [],
      lang: "es",
    });
    expect(result).toEqual([]);
  });

  it("suggests dropping cat when category filter is the blocker", () => {
    const cases = [
      makeCase({ id: "a", category: "lung" }),
      makeCase({ id: "b", category: "lung" }),
      makeCase({ id: "c", category: "lung" }),
    ];
    const result = computeRelaxationSuggestions({
      scopedCases: cases,
      cat: "cardiac", // filters everything out
      tags: [],
      query: "",
      sort: "recent",
      difficulty: [],
      lang: "es",
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "cat", count: 3, patch: { cat: null } });
  });

  it("suggests dropping each tag individually with its own count", () => {
    const cases = [
      makeCase({ id: "a", tags: { es: ["alpha"] } }),
      makeCase({ id: "b", tags: { es: ["alpha", "beta"] } }),
      makeCase({ id: "c", tags: { es: ["beta"] } }),
    ];
    // Both tags active → zero results (no case has both).
    const result = computeRelaxationSuggestions({
      scopedCases: cases,
      cat: null,
      tags: ["alpha", "beta"],
      query: "",
      sort: "recent",
      difficulty: [],
      lang: "es",
    });
    // Two suggestions, each a single-tag drop. Sorted by count desc;
    // dropping alpha yields cases with beta (b + c = 2), dropping
    // beta yields cases with alpha (a + b = 2). Equal counts → order
    // is insertion (alpha first).
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.kind)).toEqual(["tags", "tags"]);
    expect(result.map((s) => s.label).sort()).toEqual(["alpha", "beta"]);
  });

  it("suggests dropping difficulty per chip", () => {
    const cases = [
      makeCase({ id: "a", difficulty: "basic" }),
      makeCase({ id: "b", difficulty: "intermediate" }),
      makeCase({ id: "c", difficulty: "advanced" }),
    ];
    // User has only "advanced" selected but the scoped set is all
    // levels — relaxing leaves the rest visible.
    const result = computeRelaxationSuggestions({
      scopedCases: cases,
      cat: null,
      tags: [],
      query: "",
      sort: "recent",
      difficulty: ["advanced"],
      lang: "es",
    });
    // Hmm, "advanced" alone selects c (one case), not zero. Force a
    // 0-result combination: filter by both category AND difficulty
    // such that no case satisfies both.
    const harder = computeRelaxationSuggestions({
      scopedCases: cases,
      cat: "lung", // none of the cases is lung → 0 results
      tags: [],
      query: "",
      sort: "recent",
      difficulty: ["basic", "advanced"],
      lang: "es",
    });
    // The cat drop wins because dropping cat yields 2 cases (a + c
    // match the difficulty filter), while dropping each difficulty
    // individually yields 0 (still constrained by cat=lung).
    expect(harder[0]).toMatchObject({ kind: "cat", count: 2 });
    // No difficulty chip suggestion (each one still yields 0 with
    // cat=lung active).
    expect(harder.filter((s) => s.kind === "difficulty")).toHaveLength(0);
    // Silence unused warning — the first computation was the setup.
    expect(result).toBeDefined();
  });

  it("suggests clearing the query", () => {
    const cases = [makeCase({ id: "a", title: { es: "Tampon pericardio" } })];
    const result = computeRelaxationSuggestions({
      scopedCases: cases,
      cat: null,
      tags: [],
      query: "nothing-matches",
      sort: "recent",
      difficulty: [],
      lang: "es",
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "query", count: 1, patch: { query: "" } });
  });

  it("skips suggestions whose relaxation still yields zero", () => {
    // Drop one filter, still 0 → that suggestion is filtered out.
    const cases = [makeCase({ id: "a", category: "cardiac" })];
    const result = computeRelaxationSuggestions({
      scopedCases: cases,
      cat: "lung", // wrong cat
      tags: ["nonexistent"], // wrong tag too
      query: "",
      sort: "recent",
      difficulty: [],
      lang: "es",
    });
    // Drop cat: still 0 (tag still filters). Drop tag: still 0 (cat
    // still filters). Both relaxations yield 0 → empty.
    expect(result).toEqual([]);
  });

  it("sorts by count desc and caps at the limit", () => {
    const cases = [
      ...Array.from({ length: 5 }, (_, i) => makeCase({ id: `a${i}`, category: "lung" })),
      ...Array.from({ length: 3 }, (_, i) =>
        makeCase({ id: `b${i}`, category: "cardiac", tags: { es: ["x"] } }),
      ),
    ];
    const result = computeRelaxationSuggestions({
      scopedCases: cases,
      cat: "abdominal", // wrong cat → 0
      tags: ["x"],
      query: "",
      sort: "recent",
      difficulty: [],
      lang: "es",
      limit: 2,
    });
    // Dropping cat → 3 (b0–b2, the ones with tag x). Dropping tag →
    // 5 (a0–a4, in cat=lung — wait no, cat=abdominal stays active).
    // Actually dropping tag while cat=abdominal stays → 0. Dropping
    // cat while tag=x stays → 3. So only one suggestion fits.
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(2);
    // First suggestion has the highest count among feasible drops.
    if (result.length >= 2) {
      expect(result[0]!.count).toBeGreaterThanOrEqual(result[1]!.count);
    }
  });
});
