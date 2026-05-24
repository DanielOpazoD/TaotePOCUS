// Focused tests for the pure `applyCaseFilters` pipeline. The hook
// (`hooks/useCaseFilters.ts`) is already covered by
// `tests/useCaseFilters.test.tsx` — that file exercises the React
// surface (facets, memo identity, language wiring). This file is
// the COMPANION pure-function surface: no `renderHook`, no
// `LanguageProvider` wrapper, just data in → data out. Faster (no
// React mount cost) and clearer where the pipeline lives.
//
// Item #6 of the May-2026 top-wins cleanup. The original audit
// claimed there was duplication between the hook and the pure
// function; on closer reading the hook is a thin wrapper that adds
// memoization + facets, and the pure pipeline already has a single
// home in `lib/case-filters.ts`. The remaining gap was just that
// the pipeline had no dedicated test surface — hence this file.

import { describe, expect, it } from "vitest";
import { applyCaseFilters } from "@/lib/case-filters";
import type { CaseRecord } from "@/lib/types";

function makeCase(overrides: Partial<CaseRecord>): CaseRecord {
  return {
    id: overrides.id ?? "test",
    section: overrides.section ?? "atlas",
    title: overrides.title ?? { es: "Caso de prueba" },
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

const DEFAULTS = {
  cat: null,
  tags: [] as string[],
  query: "",
  sort: "recent" as const,
  difficulty: [] as never[],
  lang: "es" as const,
};

describe("applyCaseFilters", () => {
  it("returns the full set when no filters are active", () => {
    const cases = [makeCase({ id: "a" }), makeCase({ id: "b" }), makeCase({ id: "c" })];
    const out = applyCaseFilters(cases, DEFAULTS);
    expect(out.map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("filters by category", () => {
    const cases = [
      makeCase({ id: "a", category: "cardiac" }),
      makeCase({ id: "b", category: "lung" }),
      makeCase({ id: "c", category: "cardiac" }),
    ];
    const out = applyCaseFilters(cases, { ...DEFAULTS, cat: "cardiac" });
    expect(out.map((c) => c.id).sort()).toEqual(["a", "c"]);
  });

  it("AND-combines tag filters (case must have ALL selected tags)", () => {
    const cases = [
      makeCase({ id: "a", tags: { es: ["B-líneas", "Crítico"] } }),
      makeCase({ id: "b", tags: { es: ["B-líneas"] } }),
      makeCase({ id: "c", tags: { es: ["Crítico", "Patológico"] } }),
    ];
    const out = applyCaseFilters(cases, {
      ...DEFAULTS,
      tags: ["B-líneas", "Crítico"],
    });
    expect(out.map((c) => c.id)).toEqual(["a"]);
  });

  it("sorts by date desc when sort = 'recent'", () => {
    const cases = [
      makeCase({ id: "a", date: "2025-01-01" }),
      makeCase({ id: "b", date: "2026-06-01" }),
      makeCase({ id: "c", date: "2025-12-31" }),
    ];
    const out = applyCaseFilters(cases, { ...DEFAULTS, sort: "recent" });
    expect(out.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts featured first when sort = 'featured'", () => {
    const cases = [
      makeCase({ id: "a", featured: false }),
      makeCase({ id: "b", featured: true }),
      makeCase({ id: "c", featured: false }),
    ];
    const out = applyCaseFilters(cases, { ...DEFAULTS, sort: "featured" });
    expect(out[0]?.id).toBe("b");
  });

  it("filters by query against the case search haystack", () => {
    const cases = [
      makeCase({
        id: "a",
        title: { es: "Insuficiencia cardíaca con B-líneas" },
      }),
      makeCase({ id: "b", title: { es: "Trauma torácico" } }),
    ];
    const out = applyCaseFilters(cases, { ...DEFAULTS, query: "B-líneas" });
    expect(out.map((c) => c.id)).toEqual(["a"]);
  });

  it("returns an empty array when no case matches the filter combination", () => {
    const cases = [makeCase({ id: "a", category: "cardiac" })];
    const out = applyCaseFilters(cases, {
      ...DEFAULTS,
      cat: "lung",
      query: "nonexistent",
    });
    expect(out).toEqual([]);
  });

  it("is stable across identical inputs (same array order on re-runs)", () => {
    const cases = [
      makeCase({ id: "a", date: "2025-01-01" }),
      makeCase({ id: "b", date: "2025-02-01" }),
      makeCase({ id: "c", date: "2025-03-01" }),
    ];
    const a = applyCaseFilters(cases, DEFAULTS).map((c) => c.id);
    const b = applyCaseFilters(cases, DEFAULTS).map((c) => c.id);
    expect(a).toEqual(b);
  });
});
