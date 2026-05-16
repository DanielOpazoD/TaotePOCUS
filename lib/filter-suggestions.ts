// "Relax this filter" suggestions for the EmptyState.
//
// When a filter combination yields zero cases, we walk each active
// filter and compute how many cases would survive if that single
// filter were dropped. The top suggestions are surfaced as one-click
// chips inside the empty state — instead of the user staring at "no
// results" and guessing what to remove, they see "remove Avanzado
// to see 12 cases" with a button that does it.
//
// Pure module — uses `applyCaseFilters` so the count is exact, no
// behavior drift from the live grid filter pipeline. Caller is
// responsible for picking the right scope (favs vs section vs admin)
// and threading the resulting `onApply` callbacks back to the URL.

import { applyCaseFilters, type FilterOpts } from "./case-filters";
import type { CaseRecord } from "./types";
import type { Difficulty, ViewPatch } from "./url";

export type RelaxKind = "cat" | "tags" | "difficulty" | "query";

export interface RelaxationSuggestion {
  /** Which filter the suggestion would drop. */
  kind: RelaxKind;
  /** Number of cases that survive the relaxation. Always > 0. */
  count: number;
  /** Human-readable label fragment, e.g. `"Avanzado"`, `"Crítico"`,
   *  `"infarto"`. Empty for the cat clear (renderer uses dict). */
  label: string;
  /** Patch the caller should apply to drop the offending filter.
   *  Threaded directly through `replacePatch`. */
  patch: ViewPatch;
}

interface ComputeOpts extends FilterOpts {
  /** View-scoped case universe (favs / section / admin). */
  scopedCases: CaseRecord[];
  /** Maximum suggestions to return. Default 3 — beyond that the
   *  empty state becomes its own catalog. */
  limit?: number;
}

/**
 * Produce up to `limit` suggestions, each guaranteed to yield > 0
 * cases. Sorted by count desc so the most useful relaxation lands
 * first. Returns an empty array when no single-filter relaxation
 * helps — the caller should fall back to the generic "clear all"
 * action in that case.
 *
 * Single-filter relaxations only: combining multiple drops would
 * blow up the suggestion list combinatorially, and the user can
 * always click "Clear filters" at the end if individual relaxations
 * still fall short. The chip rail is for the simple cases.
 */
export function computeRelaxationSuggestions({
  scopedCases,
  cat,
  tags,
  query,
  sort,
  difficulty,
  lang,
  limit = 3,
}: ComputeOpts): RelaxationSuggestion[] {
  const baseOpts: FilterOpts = { cat, tags, query, sort, difficulty, lang };
  const suggestions: RelaxationSuggestion[] = [];

  // Drop category. Most coarse filter — usually the biggest unlock.
  if (cat) {
    const count = applyCaseFilters(scopedCases, { ...baseOpts, cat: null }).length;
    if (count > 0) {
      suggestions.push({ kind: "cat", count, label: "", patch: { cat: null } });
    }
  }

  // Drop ONE tag at a time. Each tag is a separate suggestion so
  // the user can see which one is most restrictive. Same shape as
  // the cat suggestion, just per-tag.
  for (const tag of tags) {
    const nextTags = tags.filter((t) => t !== tag);
    const count = applyCaseFilters(scopedCases, { ...baseOpts, tags: nextTags }).length;
    if (count > 0) {
      suggestions.push({ kind: "tags", count, label: tag, patch: { tags: nextTags } });
    }
  }

  // Drop ONE difficulty at a time. Same per-chip rationale as tags.
  for (const level of difficulty) {
    const nextDiff = difficulty.filter((d) => d !== level) as Difficulty[];
    const count = applyCaseFilters(scopedCases, { ...baseOpts, difficulty: nextDiff }).length;
    if (count > 0) {
      suggestions.push({
        kind: "difficulty",
        count,
        label: level,
        patch: { difficulty: nextDiff },
      });
    }
  }

  // Drop the free-text query.
  if (query.trim()) {
    const count = applyCaseFilters(scopedCases, { ...baseOpts, query: "" }).length;
    if (count > 0) {
      suggestions.push({ kind: "query", count, label: query.trim(), patch: { query: "" } });
    }
  }

  // Most cases first → most useful relaxation reads as the primary
  // suggestion. Ties broken by insertion order, which puts the
  // coarser filter relaxations (cat, tags) ahead of the finer ones.
  suggestions.sort((a, b) => b.count - a.count);
  return suggestions.slice(0, limit);
}
