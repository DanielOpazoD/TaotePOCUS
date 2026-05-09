/**
 * Editorial helpers for the case modal: reading-time estimate, difficulty
 * label, last-updated formatting, media list. Pure — testable in isolation.
 */

import { getCaseDescription, getCaseTags, getCaseTitle } from "./case-localized";
import { localeOf, translate, type Lang } from "./i18n";
import type { CaseRecord, Media } from "./types";

/** Words per minute used for the reading-time estimate. Conservative
 *  for a clinical reader skimming technical terms. The same number
 *  is reasonable for Spanish and English (medical jargon density is
 *  roughly comparable). */
const WPM = 180;

/**
 * Localized difficulty labels. Keyed by language so `difficultyLabel`
 * can return Spanish or English without branching at every callsite.
 * The map mirrors the dict keys `case.difficulty.*` but stays inline
 * here because (a) the values are tiny, (b) the i18n provider is a
 * React-only surface and `case-meta.ts` is also called from server
 * paths (sitemap, page metadata).
 */
const DIFFICULTY_LABEL: Record<Lang, Record<NonNullable<CaseRecord["difficulty"]>, string>> = {
  es: { basic: "Básico", intermediate: "Intermedio", advanced: "Avanzado" },
  en: { basic: "Basic", intermediate: "Intermediate", advanced: "Advanced" },
};

/**
 * Estimate reading time in minutes (rounded up, minimum 1) based on
 * the combined narrative fields in the active language (with EN→ES
 * fallback). Counted in the language the user is viewing so the
 * estimate matches what they'll actually read.
 *
 * Returned with a localized "min" suffix.
 */
export function readingTimeFor(c: CaseRecord, lang: Lang): string {
  const title = getCaseTitle(c, lang).value;
  const body = getCaseDescription(c, lang).value;
  const tags = getCaseTags(c, lang).tags.join(" ");
  const text = `${title} ${body} ${tags}`;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / WPM));
  return translate(lang, "case.readingTime", { minutes });
}

/** Human-readable difficulty label in the requested language. */
export function difficultyLabel(c: CaseRecord, lang: Lang): string {
  const key = c.difficulty ?? "intermediate";
  return DIFFICULTY_LABEL[lang][key];
}

/**
 * Most relevant date for "last update" display: `lastUpdated` if
 * present, falling back to `date`. Returns a locale-aware "21 de
 * abril de 2026" / "April 21, 2026" string via `Intl.DateTimeFormat`.
 */
export function lastUpdatedFor(c: CaseRecord, lang: Lang): string {
  const iso = c.lastUpdated || c.date;
  return new Date(iso).toLocaleDateString(localeOf(lang), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Returns true if the case was updated meaningfully more recently than
 *  it was published. Used to show an "actualizado" stamp in the modal. */
export function wasUpdatedAfterPublication(c: CaseRecord): boolean {
  if (!c.lastUpdated) return false;
  return new Date(c.lastUpdated).getTime() - new Date(c.date).getTime() > 24 * 60 * 60 * 1000;
}

/**
 * Unified media list for a case. Returns the primary `media` followed
 * by everything in `mediaExtra` (filtering out empty entries). Empty
 * array when the case has no real media — callers fall back to the
 * synthetic cine-loop in that case.
 *
 * Why a helper: the two-field shape (`media` + `mediaExtra`) is a
 * back-compat compromise — adding `media: Media[]` would have
 * required migrating the 326 imported cases. Centralizing the join
 * here keeps every consumer (modal, card, search index) reading the
 * full list without each having to remember the split.
 */
export function getCaseMedia(c: CaseRecord): Media[] {
  const list: Media[] = [];
  if (c.media) list.push(c.media);
  if (c.mediaExtra && c.mediaExtra.length > 0) list.push(...c.mediaExtra);
  return list;
}
