// Related-cases scorer for the modal "Casos relacionados" rail.
//
// The brief: when a reader finishes a case, suggest 3–4 more they're
// likely to find pedagogically valuable. NOT a recommendation engine
// — no AI, no embeddings, no per-user history. Just a pure scoring
// function over editorial signals already in the catalog:
//
//   1. Same category (+5)  — the strongest "this is the same family
//      of finding" signal. A cardiac case maps to other cardiac cases.
//   2. Shared ES tags (+2 each, capped) — tags carry the editorial
//      keywording. A trauma case tagged "FAST" + "abdomen" matches
//      other FAST + abdomen cases. We read the ES list so the
//      relatedness stays stable across UI language toggles (the EN
//      list may be partially translated; the ES list is the canon).
//      Capped at TAG_CAP so a single over-tagged case can't dominate
//      every related rail.
//   3. Same difficulty (+1) — light tie-breaker, not a primary
//      signal. A reader on a Basic case probably wants more Basic
//      content, but the absence of the bonus shouldn't drop a
//      strong category-match case out of the list.
//   4. Same section (+1) — secondary structural signal. Most useful
//      when categories cross sections (e.g. a cardiac case in /atlas
//      vs a cardiac case in /ecg — the section bump pulls the
//      same-section candidate up).
//
// Exclusions: the target case itself, soft-deleted (`deletedAt`),
// and purged cases. The modal renders nothing when the score-list is
// empty (early days, only one cardiac case in the catalog → no
// related panel at all).
//
// Tie-break: `date` descending (newer cases first). Stable across
// re-renders because the source array is referentially stable.

import { getCaseTags } from "./case-localized";
import type { CaseRecord } from "./types";

/** How many related cases to surface by default. Tuned to fit on
 *  one screen of modal body without scrolling on a typical desktop. */
const DEFAULT_LIMIT = 4;

/** Maximum +2 bonuses contributed by tag overlap. Caps any single
 *  over-tagged case at +6, so a case with 5 matching tags can't run
 *  away with the ranking. */
const TAG_CAP = 3;

export interface RelatedCaseOptions {
  /** Override the default limit (4). */
  limit?: number;
}

/**
 * Score one candidate relative to the target. Exported for unit
 * tests so the scoring contract is pinned independently of the
 * top-N sort.
 *
 * Returns a positive integer when the candidate shares ANY editorial
 * signal with the target. A score of 0 means "nothing in common" —
 * the candidate is excluded from the rail by `findRelatedCases`.
 */
export function scoreRelatedCase(target: CaseRecord, candidate: CaseRecord): number {
  let score = 0;
  if (candidate.category === target.category) score += 5;
  if (candidate.section === target.section) score += 1;
  const targetDiff = target.difficulty ?? "intermediate";
  const candDiff = candidate.difficulty ?? "intermediate";
  if (targetDiff === candDiff) score += 1;

  // Shared ES tags. The ES list is the canonical editorial slot —
  // every case has it, the EN list is optional and partially
  // populated. Reading ES (via `getCaseTags` so legacy-shaped
  // catalogs still normalize) keeps relatedness deterministic
  // across UI-language toggles.
  const targetTags = new Set(getCaseTags(target, "es").tags);
  let tagMatches = 0;
  for (const tag of getCaseTags(candidate, "es").tags) {
    if (targetTags.has(tag)) tagMatches += 1;
  }
  score += Math.min(tagMatches, TAG_CAP) * 2;

  return score;
}

/**
 * Top-N related cases for `target`, ordered by score desc then by
 * date desc. Excludes the target itself, soft-deleted cases, and
 * purged cases. Returns an empty array when no candidate scores
 * above zero — the modal renders nothing in that case.
 *
 * Pure + deterministic — no React, no DOM. Safe to call from server
 * paths (sitemap, JSON-LD enrichment) as well as the modal.
 */
export function findRelatedCases(
  target: CaseRecord,
  all: CaseRecord[],
  options: RelatedCaseOptions = {},
): CaseRecord[] {
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (limit <= 0) return [];

  const scored: Array<{ caso: CaseRecord; score: number }> = [];
  for (const candidate of all) {
    if (candidate.id === target.id) continue;
    if (candidate.deletedAt) continue;
    if (candidate.purged) continue;
    const score = scoreRelatedCase(target, candidate);
    if (score <= 0) continue;
    scored.push({ caso: candidate, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-break: newer first. Stable across mounts because the
    // upstream catalog array identity is stable.
    return b.caso.date.localeCompare(a.caso.date);
  });

  return scored.slice(0, limit).map((entry) => entry.caso);
}
