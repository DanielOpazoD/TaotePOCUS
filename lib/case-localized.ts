// Bilingual case-content helpers. Centralizes the four moves that
// every case-rendering consumer used to inline:
//
//   1. Pick the right slot for the active language.
//   2. Fall back to Spanish when English is missing.
//   3. Surface "this is a fallback" so the renderer can show a
//      small "ES" badge.
//   4. Normalize legacy plain-string persistence into the dual
//      `LocalizedString` / `LocalizedTags` shapes.
//
// Pure module — no React, no DOM. Consumers in components reach in
// from `useLanguage().lang`; server / test code passes the lang
// explicitly. The `normalizeCase` helper is invoked at the data
// boundary (repo / store / schema validator) so React-side code
// never sees the legacy shape.
//
// Why a dedicated module instead of extending `case-description`:
// the legacy `getDescription(c)` had a single signature that every
// caller threaded through; widening it now means every callsite
// gains a `lang` arg. Splitting the new surface (`getCaseTitle`,
// `getCaseDescription`, `getCaseTags`) keeps `case-description`'s
// API tight (still pure description-only) and gives the new code
// a more discoverable home.

import { translate, type Lang } from "./i18n";
import type { CaseRecord, LocalizedString, LocalizedTags } from "./types";

/**
 * Result of resolving a localized field. The renderer reads `value`
 * and consults `isFallback` to decide whether to attach the small
 * "ES" badge that signals "translation pending".
 */
export interface LocalizedRead {
  /** The string actually shown to the user. */
  value: string;
  /** True when EN was requested but missing — the value above is ES. */
  isFallback: boolean;
  /** Which language slot the value came from. */
  source: Lang;
}

/**
 * Coerce any persisted shape (modern object, legacy plain string,
 * malformed null/undefined) into a well-typed `LocalizedString`.
 * Used at every data ingress: repo reads, schema validator output,
 * imported corpus parsing, override merges.
 *
 * Policy:
 *   - Plain string → `{ es: <string> }`. Legacy persistence path.
 *   - Object with `es` → kept as-is, with `en` preserved if a string.
 *   - Anything else → `{ es: "" }` so consumers don't crash on a
 *     malformed entry; the empty value is what the search index and
 *     reading-time helpers already handle gracefully.
 */
export function normalizeLocalizedString(value: unknown): LocalizedString {
  if (typeof value === "string") return { es: value };
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const es = typeof obj.es === "string" ? obj.es : "";
    const out: LocalizedString = { es };
    if (typeof obj.en === "string" && obj.en.length > 0) out.en = obj.en;
    return out;
  }
  return { es: "" };
}

/**
 * Counterpart for tag lists. Legacy persistence is `string[]`; the
 * new shape is `{ es: string[]; en?: string[] }`. Empty / malformed
 * inputs become `{ es: [] }` so callers can safely call `.includes`
 * / `.map` on the resolved list.
 */
export function normalizeLocalizedTags(value: unknown): LocalizedTags {
  if (Array.isArray(value)) {
    return { es: value.filter((x): x is string => typeof x === "string") };
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const es = Array.isArray(obj.es)
      ? obj.es.filter((x): x is string => typeof x === "string")
      : [];
    const out: LocalizedTags = { es };
    if (Array.isArray(obj.en)) {
      const en = obj.en.filter((x): x is string => typeof x === "string");
      if (en.length > 0) out.en = en;
    }
    return out;
  }
  return { es: [] };
}

/**
 * Apply normalization to every translatable field on a case record.
 * Idempotent: a case already in the new shape passes through with
 * the same data (just defensively re-typed). Returns a new object
 * — never mutates the input.
 */
export function normalizeCase(c: CaseRecord): CaseRecord {
  return {
    ...c,
    title: normalizeLocalizedString(c.title as unknown),
    description: normalizeLocalizedString(c.description as unknown),
    tags: normalizeLocalizedTags(c.tags as unknown),
  };
}

/**
 * Resolve a `LocalizedString` to the language the user is viewing.
 * Falls back to Spanish when EN is requested but missing or empty.
 * The `source` flag tells the caller whether the fallback fired.
 *
 * Defensive against malformed input: if a legacy plain string or a
 * malformed object slips past upstream validation (a stale override
 * spread on top of a normalized case record, an old backup imported
 * mid-rollout), the helper normalizes inline rather than crashing
 * with "cannot read property of undefined". The runtime cost is a
 * single object allocation per call, which is negligible compared
 * to the React render around it.
 */
export function readLocalized(value: LocalizedString | unknown, lang: Lang): LocalizedRead {
  // Inline normalization — handles plain string (legacy), normal
  // `{ es; en? }`, and accidental `null` / missing slot.
  const norm = normalizeLocalizedString(value);
  if (lang === "es") {
    return { value: norm.es, isFallback: false, source: "es" };
  }
  if (typeof norm.en === "string" && norm.en.length > 0) {
    return { value: norm.en, isFallback: false, source: "en" };
  }
  return { value: norm.es, isFallback: true, source: "es" };
}

/** Sugar for case titles. Equivalent to `readLocalized(c.title, lang)`. */
export function getCaseTitle(c: CaseRecord, lang: Lang): LocalizedRead {
  return readLocalized(c.title as unknown, lang);
}

/** Sugar for case bodies. Equivalent to `readLocalized(c.description, lang)`. */
export function getCaseDescription(c: CaseRecord, lang: Lang): LocalizedRead {
  return readLocalized(c.description as unknown, lang);
}

/**
 * Tag-list counterpart. Returns the language-appropriate list with
 * an `isFallback` flag that follows the same EN→ES policy as the
 * string fields. The fallback fires when:
 *   - lang is "en", AND
 *   - `tags.en` is missing OR empty
 *
 * An empty EN list is treated as missing on purpose: an admin who
 * cleared the EN tags clearly hasn't translated this case yet.
 *
 * Defensive against legacy shapes: if `c.tags` arrives as a plain
 * `string[]` (pre-Phase-2 override merged on top of a normalized
 * case, ancient backup), normalize inline so consumers never hit
 * the "tags.es is undefined" runtime error.
 */
export function getCaseTags(
  c: CaseRecord,
  lang: Lang,
): { tags: string[]; isFallback: boolean; source: Lang } {
  const norm = normalizeLocalizedTags(c.tags as unknown);
  if (lang === "es") {
    return { tags: norm.es, isFallback: false, source: "es" };
  }
  if (Array.isArray(norm.en) && norm.en.length > 0) {
    return { tags: norm.en, isFallback: false, source: "en" };
  }
  return { tags: norm.es, isFallback: true, source: "es" };
}

/**
 * Concatenate every localized field into a single haystack for the
 * free-text search filter. Used by `useCaseFilters`. Includes both
 * languages so a user typing in EN against a partially-translated
 * catalog still finds the case via its ES content.
 *
 * Returned in lowercase (search is case-insensitive); empty parts
 * are skipped so the resulting string doesn't pad with whitespace.
 *
 * Defensive against legacy persistence shapes — title / description
 * may arrive as plain strings, tags as plain arrays. Normalizes
 * inline rather than throwing "cannot read property" inside a memo.
 */
export function searchHaystack(c: CaseRecord): string {
  const title = normalizeLocalizedString(c.title as unknown);
  const description = normalizeLocalizedString(c.description as unknown);
  const tags = normalizeLocalizedTags(c.tags as unknown);
  const parts: string[] = [];
  if (title.es) parts.push(title.es);
  if (title.en) parts.push(title.en);
  if (description.es) parts.push(description.es);
  if (description.en) parts.push(description.en);
  parts.push(...tags.es);
  if (tags.en) parts.push(...tags.en);
  if (c.author) parts.push(c.author);
  return parts.join(" ").toLowerCase();
}

/**
 * Locale-aware comparator for sorting cases by title. Uses the
 * active language's title slot (with fallback) so an EN viewer
 * sees the catalog ordered by the EN titles where available.
 */
export function compareTitles(a: CaseRecord, b: CaseRecord, lang: Lang): number {
  return getCaseTitle(a, lang).value.localeCompare(getCaseTitle(b, lang).value);
}

/**
 * UI label for the fallback badge. Returns the abbreviation of the
 * language the value actually came from ("ES"). The renderer should
 * mount the badge only when `isFallback === true`.
 */
export function fallbackBadgeLabel(read: LocalizedRead): string {
  return read.source.toUpperCase();
}

/**
 * Translated tooltip text for the fallback badge. Shows a friendly
 * "Translation pending — Spanish shown" hint on hover. Pure for
 * SSR / tests; React consumers usually go through `useT()`.
 */
export function fallbackBadgeTitle(lang: Lang): string {
  return translate(lang, "case.fallback.title");
}
