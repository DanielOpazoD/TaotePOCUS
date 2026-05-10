// Regression pin for `useCaseFilters` — the hook builds the
// `sectionCategories` facet that the sidebar renders. A previous
// implementation walked only the built-in `CATEGORIES` list and
// silently dropped any admin-managed custom category, even when
// cases were assigned to it. The bug surfaced as: admin creates
// "ocular" → assigns a case → sidebar still shows only the built-in
// 8. Pin the merged-list behaviour so it can't regress.

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useCaseFilters } from "@/hooks/useCaseFilters";
import { LanguageProvider } from "@/hooks/useLanguage";
import { CATEGORIES } from "@/lib/data";
import type { CaseRecord, Category, View } from "@/lib/types";

const ATLAS_VIEW: View = { kind: "section", section: "atlas" };

/** Minimal CaseRecord factory — only the fields the hook actually
 *  reads. Defaults match a happy-path atlas case. */
function makeCase(overrides: Partial<CaseRecord>): CaseRecord {
  return {
    id: overrides.id ?? "test",
    section: overrides.section ?? "atlas",
    title: overrides.title ?? { es: "Test" },
    category: overrides.category ?? "cardiac",
    tags: overrides.tags ?? { es: [] },
    modality: overrides.modality ?? "",
    loop: overrides.loop ?? "blines",
    media: overrides.media,
    author: overrides.author ?? "Admin",
    role: overrides.role ?? "Admin",
    date: overrides.date ?? "2026-01-01",
    description: overrides.description ?? { es: "" },
    featured: overrides.featured ?? false,
    ...overrides,
  };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

beforeEach(() => {
  localStorage.clear();
});

describe("useCaseFilters — sectionCategories facet", () => {
  it("includes custom (non-built-in) categories that have at least one case", () => {
    const ocular: Category = { id: "c:ocular", label: "Ocular" };
    const cases: CaseRecord[] = [
      makeCase({ id: "a", category: "cardiac" }),
      makeCase({ id: "b", category: "c:ocular" }),
      makeCase({ id: "c", category: "c:ocular" }),
    ];
    const { result } = renderHook(
      () =>
        useCaseFilters({
          allCases: cases,
          favs: [],
          view: ATLAS_VIEW,
          cat: null,
          tags: [],
          query: "",
          sort: "recent",
          categories: [...CATEGORIES, ocular],
        }),
      { wrapper },
    );

    const ids = result.current.sectionCategories.map((c) => c.id);
    expect(ids).toContain("c:ocular");

    const ocularEntry = result.current.sectionCategories.find((c) => c.id === "c:ocular");
    expect(ocularEntry?.count).toBe(2);
  });

  it("drops categories with zero matching cases", () => {
    const cases: CaseRecord[] = [makeCase({ id: "a", category: "cardiac" })];
    const { result } = renderHook(
      () =>
        useCaseFilters({
          allCases: cases,
          favs: [],
          view: ATLAS_VIEW,
          cat: null,
          tags: [],
          query: "",
          sort: "recent",
          categories: CATEGORIES,
        }),
      { wrapper },
    );

    const ids = result.current.sectionCategories.map((c) => c.id);
    expect(ids).toEqual(["cardiac"]);
  });

  it("falls back to built-in CATEGORIES when no `categories` arg is passed", () => {
    // Back-compat: the hook signature widened to accept a categories
    // list. Older tests that don't pass it should still work and see
    // the built-in 8 as the universe.
    const cases: CaseRecord[] = [
      makeCase({ id: "a", category: "cardiac" }),
      makeCase({ id: "b", category: "c:ocular" }), // unknown id → dropped
    ];
    const { result } = renderHook(
      () =>
        useCaseFilters({
          allCases: cases,
          favs: [],
          view: ATLAS_VIEW,
          cat: null,
          tags: [],
          query: "",
          sort: "recent",
        }),
      { wrapper },
    );

    const ids = result.current.sectionCategories.map((c) => c.id);
    expect(ids).toContain("cardiac");
    expect(ids).not.toContain("c:ocular"); // unknown id under default universe
  });
});
