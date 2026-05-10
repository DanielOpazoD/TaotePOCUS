"use client";

import { useMemo } from "react";
import { CATEGORIES } from "@/lib/data";
import { compareTitles, getCaseTags, searchHaystack } from "@/lib/case-localized";
import { useLanguage } from "./useLanguage";
import type { CaseRecord, Category, CategoryWithCount, View } from "@/lib/types";
import type { SortOrder } from "@/lib/url";

interface Args {
  /** Full universe of cases. Pass `[...userCases.live, ...SEED_CASES]`. */
  allCases: CaseRecord[];
  /** IDs of the cases the current user has favorited. */
  favs: string[];
  /** Current view (section / favs / admin), drives the initial scoping. */
  view: View;
  /** Active category filter, or `null` for "all categories". */
  cat: string | null;
  /** Active tag filters; AND-combined (a case must have *all* tags). */
  tags: string[];
  /** Free-text query; matched against title, diagnosis, findings, tags, author. */
  query: string;
  /** Sort order applied at the end of the pipeline. */
  sort: SortOrder;
  /** Categories list (built-in + admin-managed custom). Optional —
   *  defaults to the built-in `CATEGORIES`. The list defines which
   *  ids are eligible for the sidebar's facet rail. Passing the
   *  merged list lets a fresh custom category ("ocular", "vía aérea")
   *  appear next to the built-ins as soon as a single case carries
   *  it; without this, custom ids were silently dropped from the
   *  facet computation. */
  categories?: Category[];
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
export function useCaseFilters({
  allCases,
  favs,
  view,
  cat,
  tags,
  query,
  sort,
  categories,
}: Args): Result {
  const { lang } = useLanguage();
  const categoryUniverse = categories ?? CATEGORIES;

  // Indirection: only use `favs` as a memo dep when the view actually
  // depends on it. Without this gate, every fav toggle (a hot path —
  // user clicks a heart in the catalog) invalidates `scopedCases`
  // even on /atlas, which cascades into `filtered` recompute → grid
  // re-render → 60+ CaseCards re-render. The gate keeps the favs
  // toggle's blast radius limited to the favorites view itself.
  const favSet = useMemo(() => (view.kind === "favs" ? new Set(favs) : null), [view.kind, favs]);

  const scopedCases = useMemo(() => {
    if (view.kind === "favs") {
      // `favSet` is non-null here by construction. O(1) lookup per case.
      const set = favSet!;
      return allCases.filter((c) => set.has(c.id));
    }
    if (view.kind === "section") {
      return allCases.filter((c) => (c.section || "atlas") === view.section);
    }
    return allCases;
    // `favSet` is captured to satisfy the lint exhaustive-deps rule;
    // when view.kind !== "favs" it stays `null` and identity is stable
    // across favs toggles, so it doesn't trigger spurious recomputes.
  }, [allCases, view, favSet]);

  const sectionCategories = useMemo<CategoryWithCount[]>(() => {
    const counts: Record<string, number> = {};
    scopedCases.forEach((c) => {
      counts[c.category] = (counts[c.category] ?? 0) + 1;
    });
    // Walk the FULL category universe (built-ins + custom) so a
    // newly-created admin category surfaces in the sidebar as soon as
    // a case is assigned to it. The previous implementation walked
    // only `CATEGORIES` (built-in 8) and dropped every custom id.
    return categoryUniverse
      .filter((c) => (counts[c.id] ?? 0) > 0)
      .map((c) => ({
        ...c,
        count: counts[c.id] ?? 0,
      }));
  }, [scopedCases, categoryUniverse]);

  const sectionTags = useMemo(() => {
    // Frequency map of tags in the active language (with ES fallback
    // for cases the admin hasn't translated yet). The sidebar then
    // shows the EN tags when the user is in EN mode, but still
    // surfaces ES tags from un-translated cases so the catalog
    // stays browseable mid-rollout.
    const counts: Record<string, number> = {};
    scopedCases.forEach((c) => {
      getCaseTags(c, lang).tags.forEach((t) => {
        counts[t] = (counts[t] ?? 0) + 1;
      });
    });
    return Object.keys(counts).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  }, [scopedCases, lang]);

  const filtered = useMemo(() => {
    let list = scopedCases.slice();
    if (cat) list = list.filter((c) => c.category === cat);
    if (tags.length) {
      list = list.filter((c) => {
        // Active filter tags are matched against the current-language
        // tag list (with EN→ES fallback). A user who applied "Cardiac"
        // in EN mode keeps the same case scope when they flip to ES
        // because the case's ES list contains the equivalent tag —
        // the URL `?tags=` slot stays language-stable across toggles.
        const caseTags = getCaseTags(c, lang).tags;
        return tags.every((t) => caseTags.includes(t));
      });
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      // `searchHaystack` concatenates ES + EN content + tags + author
      // so a query in either language matches even when the case is
      // only partially translated.
      list = list.filter((c) => searchHaystack(c).includes(q));
    }
    if (sort === "recent") list.sort((a, b) => b.date.localeCompare(a.date));
    if (sort === "title") list.sort((a, b) => compareTitles(a, b, lang));
    if (sort === "featured") list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    return list;
  }, [scopedCases, cat, tags, query, sort, lang]);

  return { scopedCases, sectionCategories, sectionTags, filtered };
}
