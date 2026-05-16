// Pure filter + sort pipeline. Lifted out of `useCaseFilters` so it
// can be called as a plain function from outside the hook — namely
// `lib/filter-suggestions.ts`, which needs to score "what would
// happen if I relaxed filter X" against an empty result set without
// re-entering React rendering.
//
// Stays free of React imports so server paths (sitemap, JSON-LD,
// audit tests) can call it too. The hook is now a thin React glue:
// memoize on input identities and forward into this function.

import { compareTitles, getCaseTags, searchHaystack } from "./case-localized";
import type { Lang } from "./i18n";
import type { CaseRecord } from "./types";
import type { Difficulty, SortOrder } from "./url";

export interface FilterOpts {
  /** Active category id, or null for "all categories". */
  cat: string | null;
  /** Active tag filters; AND-combined. */
  tags: string[];
  /** Free-text query. Matched via `searchHaystack`. */
  query: string;
  /** Sort order applied at the end of the pipeline. */
  sort: SortOrder;
  /** Active difficulty levels; OR-combined. */
  difficulty: Difficulty[];
  /** Active UI language for tag / title locale resolution. */
  lang: Lang;
}

/**
 * Apply the filter + sort pipeline to a view-scoped case list.
 *
 * Stable, deterministic, no side effects. Identical inputs produce
 * an array with the same length + order, suitable for memoization at
 * the caller. The pipeline matches the historical hook contract —
 * see `useCaseFilters` for the original commentary on each branch.
 */
export function applyCaseFilters(scopedCases: CaseRecord[], opts: FilterOpts): CaseRecord[] {
  const { cat, tags, query, sort, difficulty, lang } = opts;
  let list = scopedCases.slice();
  if (cat) list = list.filter((c) => c.category === cat);
  if (tags.length) {
    list = list.filter((c) => {
      const caseTags = getCaseTags(c, lang).tags;
      return tags.every((t) => caseTags.includes(t));
    });
  }
  if (query.trim()) {
    const q = query.toLowerCase();
    list = list.filter((c) => searchHaystack(c).includes(q));
  }
  if (difficulty.length) {
    const set = new Set(difficulty);
    list = list.filter((c) => set.has(c.difficulty ?? "intermediate"));
  }
  if (sort === "recent") list.sort((a, b) => b.date.localeCompare(a.date));
  if (sort === "title") list.sort((a, b) => compareTitles(a, b, lang));
  if (sort === "featured") list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  return list;
}
