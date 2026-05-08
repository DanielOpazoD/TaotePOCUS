"use client";

import { useMemo } from "react";
import { mergeWithOverrides } from "./useCaseOverrides";
import { useSeedCases } from "./useSeedCases";
import type { CaseRecord } from "@/lib/types";

interface Args {
  /** Admin-uploaded cases (live only — `userCases.live`). */
  userCasesLive: CaseRecord[];
  /** Per-case override map keyed by id. */
  overrides: Record<string, Partial<CaseRecord>>;
}

interface Result {
  /** Public-facing catalog: seed + user, with overrides applied,
   *  with soft-deleted and purged cases filtered out. */
  allCases: CaseRecord[];
  /** Soft-deleted seed/imported cases — surfaced in the admin trash
   *  section. Excludes purged cases (they don't appear anywhere). */
  trashedImports: CaseRecord[];
  /** Cases per category id, computed off `allCases`. Feeds the
   *  Categories editor's "in use" badge and deletion guard. */
  categoryCaseCounts: Record<string, number>;
}

/**
 * Catalog-derivation hook. Consolidates the three memos that App.tsx
 * used to compute inline (the audit flagged App.tsx for hosting too
 * many derived slices side-by-side; this lifts them into a named
 * hook with one clear input contract).
 *
 * Filtering rules:
 *
 *   - `deletedAt` set → soft-deleted, recoverable from admin trash.
 *     Hidden from public catalog but kept in `trashedImports` for
 *     the admin Papelera section.
 *   - `purged` set → hard-delete tombstone. Hidden from EVERYWHERE
 *     including the trash. The override stays in storage so future
 *     regenerations of the corpus JSON keep filtering it.
 *
 * The two filters compose: a case must have neither `deletedAt` nor
 * `purged` to appear in `allCases`.
 */
export function useMergedCatalog({ userCasesLive, overrides }: Args): Result {
  // The seed corpus arrives via a code-split chunk (see
  // `lib/seed-cases.ts`). On first paint `seed` is `[]`; the user
  // sees only their own cases for a few ms until the chunk lands,
  // then the catalog completes. The atlas grid handles the empty
  // intermediate state via its existing skeleton path.
  const { seed } = useSeedCases();

  const allCases = useMemo<CaseRecord[]>(
    () =>
      mergeWithOverrides([...userCasesLive, ...seed], overrides).filter(
        (c) => !c.deletedAt && !c.purged,
      ),
    [userCasesLive, seed, overrides],
  );

  const trashedImports = useMemo<CaseRecord[]>(
    () => mergeWithOverrides(seed, overrides).filter((c) => c.deletedAt && !c.purged),
    [seed, overrides],
  );

  const categoryCaseCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const c of allCases) {
      counts[c.category] = (counts[c.category] ?? 0) + 1;
    }
    return counts;
  }, [allCases]);

  return { allCases, trashedImports, categoryCaseCounts };
}
