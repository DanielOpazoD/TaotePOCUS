"use client";

// Derived projections off `allCases`. Four `useMemo`s that App.tsx
// used to host side-by-side; bundled here so the orchestrator just
// destructures one return value. Pure data — no side effects, no
// state.

import { useMemo } from "react";
import type { CaseRecord, CategoryWithCount } from "@/lib/types";

interface Args {
  allCases: CaseRecord[];
  /** From `useCaseFilters` — categories that have at least one case
   *  in the current view, with counts. Already memoized upstream;
   *  we filter to the publicly-visible set here. */
  rawSectionCategories: CategoryWithCount[];
  /** Predicate from `useCatalogConfig`. */
  isCategoryHidden: (id: string) => boolean;
  /** Currently-open case id (URL-driven). */
  openCaseId: string | null;
  /** Currently-presenting case id (URL-driven). */
  presentingId: string | null;
}

interface Result {
  /** Public sidebar / hero exclude any category the admin hid. */
  sectionCategories: CategoryWithCount[];
  /** Map section id → number of LIVE cases (excludes soft-deleted).
   *  Surfaced in the admin Secciones editor as a "N casos" hint. */
  sectionCaseCounts: Record<string, number>;
  /** Currently-open case (resolved from `openCaseId` against
   *  `allCases`), or null. */
  openCase: CaseRecord | null;
  /** Currently-presenting case (resolved from `presentingId`
   *  against `allCases`), or null. */
  presentingCase: CaseRecord | null;
}

export function useCatalogDerivations({
  allCases,
  rawSectionCategories,
  isCategoryHidden,
  openCaseId,
  presentingId,
}: Args): Result {
  // Public sidebar / hero exclude any category the admin hid from
  // the Atlas POCUS view. Cases assigned to a hidden category still
  // exist (filterable via search / direct URL); they just don't
  // surface in the nav rail.
  const sectionCategories = useMemo(
    () => rawSectionCategories.filter((c) => !isCategoryHidden(c.id)),
    [rawSectionCategories, isCategoryHidden],
  );

  // Case-count-per-section, surfaced in the admin Secciones editor
  // as a "N casos" hint. Soft-deleted cases are excluded — they're
  // already invisible to the public view.
  const sectionCaseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of allCases) {
      if (c.deletedAt) continue;
      counts[c.section] = (counts[c.section] ?? 0) + 1;
    }
    return counts;
  }, [allCases]);

  const openCase = useMemo<CaseRecord | null>(
    () => (openCaseId ? (allCases.find((c) => c.id === openCaseId) ?? null) : null),
    [allCases, openCaseId],
  );

  const presentingCase = useMemo<CaseRecord | null>(
    () => (presentingId ? (allCases.find((c) => c.id === presentingId) ?? null) : null),
    [allCases, presentingId],
  );

  return { sectionCategories, sectionCaseCounts, openCase, presentingCase };
}
