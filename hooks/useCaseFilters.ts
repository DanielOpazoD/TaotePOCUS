"use client";

import { useMemo } from "react";
import { CATEGORIES } from "@/lib/data";
import type { CaseRecord, CategoryId, CategoryWithCount, View } from "@/lib/types";
import type { SortOrder } from "@/lib/url";

interface Args {
  /** Full universe of cases. Pass `[...userCases.live, ...SEED_CASES]`. */
  allCases: CaseRecord[];
  /** IDs of the cases the current user has favorited. */
  favs: string[];
  /** Current view (section / favs / admin), drives the initial scoping. */
  view: View;
  /** Active category filter, or `null` for "all categories". */
  cat: CategoryId | null;
  /** Active tag filters; AND-combined (a case must have *all* tags). */
  tags: string[];
  /** Free-text query; matched against title, diagnosis, findings, tags, author. */
  query: string;
  /** Sort order applied at the end of the pipeline. */
  sort: SortOrder;
}

interface Result {
  /** Cases scoped to the current view (section / favs) before filtering. */
  scopedCases: CaseRecord[];
  /** Categories that have at least one case in `scopedCases`, with counts. */
  sectionCategories: CategoryWithCount[];
  /** Tags appearing in `scopedCases`, ordered by frequency desc. */
  sectionTags: string[];
  /** `scopedCases` after category, tag, query and sort filters. */
  filtered: CaseRecord[];
}

/**
 * Pure derivation of the case grid from URL state + the case list.
 * Lives in a hook (rather than a plain function) because consumers
 * benefit from `useMemo` caching across renders — the inputs are
 * arrays that don't change identity often.
 *
 * Order of operations matters: scope by view first (so category /
 * tag counts reflect the section the user is in), then apply the
 * cross-cutting filters, then sort.
 *
 * @param args - The filter inputs. See {@link Args}.
 * @returns Four memoized projections — `scopedCases` (view-scoped raw),
 *   `sectionCategories` and `sectionTags` (sidebar facets), and
 *   `filtered` (the final list the grid renders).
 *
 * @example
 *   const { filtered, sectionCategories, sectionTags } = useCaseFilters({
 *     allCases, favs, view, cat, tags, query, sort,
 *   });
 *   return <Grid cases={filtered} />;
 */
export function useCaseFilters({ allCases, favs, view, cat, tags, query, sort }: Args): Result {
  const scopedCases = useMemo(() => {
    if (view.kind === "favs") return allCases.filter((c) => favs.includes(c.id));
    if (view.kind === "section")
      return allCases.filter((c) => (c.section || "atlas") === view.section);
    return allCases;
  }, [allCases, view, favs]);

  const sectionCategories = useMemo<CategoryWithCount[]>(() => {
    const counts: Record<string, number> = {};
    scopedCases.forEach((c) => {
      counts[c.category] = (counts[c.category] ?? 0) + 1;
    });
    return CATEGORIES.filter((c) => (counts[c.id] ?? 0) > 0).map((c) => ({
      ...c,
      count: counts[c.id] ?? 0,
    }));
  }, [scopedCases]);

  const sectionTags = useMemo(() => {
    const counts: Record<string, number> = {};
    scopedCases.forEach((c) =>
      c.tags.forEach((t) => {
        counts[t] = (counts[t] ?? 0) + 1;
      }),
    );
    return Object.keys(counts).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  }, [scopedCases]);

  const filtered = useMemo(() => {
    let list = scopedCases.slice();
    if (cat) list = list.filter((c) => c.category === cat);
    if (tags.length) list = list.filter((c) => tags.every((t) => c.tags.includes(t)));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.diagnosis.toLowerCase().includes(q) ||
          c.findings.toLowerCase().includes(q) ||
          c.tags.join(" ").toLowerCase().includes(q) ||
          c.author.toLowerCase().includes(q),
      );
    }
    if (sort === "recent") list.sort((a, b) => b.date.localeCompare(a.date));
    if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "featured") list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    return list;
  }, [scopedCases, cat, tags, query, sort]);

  return { scopedCases, sectionCategories, sectionTags, filtered };
}
