// Tests for the related-cases scorer. The function feeds the
// "Casos relacionados" rail at the bottom of the case modal — pure
// over editorial signals (category, tags, difficulty, section), no
// AI involved. Pin the scoring contract here so editorial
// rebalancing in the future lands as a deliberate change, not an
// accidental drift.

import { describe, expect, it } from "vitest";
import { findRelatedCases, scoreRelatedCase } from "@/lib/related-cases";
import type { CaseRecord } from "@/lib/types";

/** Minimal factory — only the fields the scorer reads. */
function makeCase(overrides: Partial<CaseRecord> & { id: string }): CaseRecord {
  // Spread overrides FIRST, then apply defaults for any field the
  // caller omitted — keeps the type narrow without TS2783
  // duplicate-key warnings.
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

describe("scoreRelatedCase", () => {
  it("scores zero when nothing in common", () => {
    const a = makeCase({ id: "a", category: "cardiac", section: "atlas", difficulty: "basic" });
    const b = makeCase({
      id: "b",
      category: "lung",
      section: "ecg",
      difficulty: "advanced",
      tags: { es: ["something-else"] },
    });
    expect(scoreRelatedCase(a, b)).toBe(0);
  });

  it("adds +5 for same category, +1 for same section, +1 for same difficulty", () => {
    const a = makeCase({ id: "a", category: "cardiac", section: "atlas", difficulty: "basic" });
    const b = makeCase({ id: "b", category: "cardiac", section: "atlas", difficulty: "basic" });
    expect(scoreRelatedCase(a, b)).toBe(7);
  });

  it("adds +2 per shared ES tag, capped at 3 overlaps (+6 max)", () => {
    const a = makeCase({
      id: "a",
      category: "lung", // different category to isolate tag scoring
      section: "atlas",
      tags: { es: ["x", "y", "z", "w", "v"] },
    });
    const b = makeCase({
      id: "b",
      category: "cardiac",
      section: "ecg",
      difficulty: "advanced",
      tags: { es: ["x", "y", "z", "w", "v"] }, // 5 overlaps, should cap at 3
    });
    // 5 matches → capped at 3 → +6
    expect(scoreRelatedCase(a, b)).toBe(6);
  });

  it("treats missing difficulty as 'intermediate' for the bonus", () => {
    const a = makeCase({ id: "a", difficulty: "intermediate" });
    const b = makeCase({ id: "b" /* no difficulty */ });
    // same category + same section + missing-difficulty=intermediate matches
    expect(scoreRelatedCase(a, b)).toBe(7);
  });
});

describe("findRelatedCases", () => {
  const target = makeCase({
    id: "target",
    category: "cardiac",
    section: "atlas",
    difficulty: "intermediate",
    tags: { es: ["B-líneas", "Tamponade"] },
    date: "2026-04-01",
  });

  it("excludes the target itself", () => {
    const result = findRelatedCases(target, [target]);
    expect(result).toEqual([]);
  });

  it("excludes soft-deleted and purged cases", () => {
    const candidates: CaseRecord[] = [
      makeCase({
        id: "deleted",
        category: "cardiac",
        deletedAt: "2026-04-15",
      }),
      makeCase({ id: "purged", category: "cardiac", purged: true }),
      makeCase({ id: "live", category: "cardiac" }),
    ];
    const result = findRelatedCases(target, candidates);
    expect(result.map((c) => c.id)).toEqual(["live"]);
  });

  it("returns nothing when no candidate scores > 0", () => {
    const candidates: CaseRecord[] = [
      makeCase({
        id: "totally-unrelated",
        category: "lung",
        section: "ecg",
        difficulty: "advanced",
        tags: { es: ["nothing-in-common"] },
      }),
    ];
    expect(findRelatedCases(target, candidates)).toEqual([]);
  });

  it("orders by score desc, then by date desc as tie-break", () => {
    const candidates: CaseRecord[] = [
      // Strong: same cat + 2 tag matches + same section + same diff → 5+1+1+4=11
      makeCase({
        id: "strong",
        category: "cardiac",
        section: "atlas",
        difficulty: "intermediate",
        tags: { es: ["B-líneas", "Tamponade"] },
        date: "2026-03-01",
      }),
      // Medium: same cat + same section + same diff = 7 (older date)
      makeCase({
        id: "medium-old",
        category: "cardiac",
        section: "atlas",
        difficulty: "intermediate",
        date: "2025-12-01",
      }),
      // Medium: same cat + same section + same diff = 7 (newer date — wins tie)
      makeCase({
        id: "medium-new",
        category: "cardiac",
        section: "atlas",
        difficulty: "intermediate",
        date: "2026-02-01",
      }),
    ];
    const result = findRelatedCases(target, candidates);
    expect(result.map((c) => c.id)).toEqual(["strong", "medium-new", "medium-old"]);
  });

  it("clamps to the requested limit", () => {
    const candidates: CaseRecord[] = Array.from({ length: 10 }, (_, i) =>
      makeCase({
        id: `c${i}`,
        category: "cardiac",
        section: "atlas",
        difficulty: "intermediate",
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      }),
    );
    const result = findRelatedCases(target, candidates, { limit: 3 });
    expect(result.length).toBe(3);
  });
});
