// Render text with the parts that match `query` wrapped in
// `<mark>` elements. Used by the catalog cards so the user can
// see WHY a case showed up in their search results.
//
// Why a helper module: three card surfaces (title, description,
// tags) want the same highlight, and the highlight needs to
// stay accessible (real `<mark>` tag, not a styled span) and
// resilient to query weirdness (empty, regex special chars,
// unicode). One implementation, three call sites.
//
// Match policy:
//   - Case-insensitive.
//   - Whole-substring (no word-boundary requirement) — matches
//     the filter pipeline in `useCaseFilters`.
//   - Locale-aware so "B-líneas" matches "b-lineas" via NFD
//     normalization. Same as the filter pipeline.

import type { ReactNode } from "react";

/**
 * Strip diacritics for a fold-equal compare. "líneas" → "lineas".
 * The filter pipeline doesn't normalize today; if it ever does,
 * mirror the policy here.
 */
function fold(s: string): string {
  // NFD splits combining chars; the regex strips them. Tilde + ñ
  // is preserved correctly because ñ is a base character, not a
  // combining sequence.
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Escape regex metacharacters so a query like `(b)` doesn't blow
 * up the matcher. Standard escape table per MDN; covers every
 * special token in JS regex syntax.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wrap each occurrence of `query` inside `text` in a `<mark>`.
 * Returns the original string when `query` is empty or has no
 * matches — safe to call regardless of whether the user is
 * actively searching.
 *
 * The match runs against folded (diacritic-stripped) versions of
 * both strings so "lineas" matches "líneas", but the rendered
 * output preserves the original (accented) text from `text`. The
 * returned children are an array of strings + `<mark>` nodes the
 * caller drops into JSX directly.
 */
export function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const foldedText = fold(text);
  const foldedQuery = fold(q);
  if (!foldedText.includes(foldedQuery)) return text;
  // Build a regex against the FOLDED text to find positions, then
  // slice from the ORIGINAL text using those positions. Both have
  // the same length per character (NFD strips combining marks
  // which are zero-width in the original visual flow), but unicode
  // is surprising — fall back to a literal scan if length differs.
  if (foldedText.length !== text.length) {
    // Fallback: case-insensitive literal scan against the original.
    return literalHighlight(text, q);
  }
  const re = new RegExp(escapeRegex(foldedQuery), "gi");
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(foldedText)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <mark key={key++} className="search-match">
        {text.slice(match.index, match.index + match[0].length)}
      </mark>,
    );
    last = match.index + match[0].length;
    // Avoid an infinite loop on a zero-length match (shouldn't
    // happen with non-empty query, but defensive).
    if (match[0].length === 0) re.lastIndex += 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function literalHighlight(text: string, query: string): ReactNode {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const re = new RegExp(escapeRegex(q), "gi");
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(lower)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <mark key={key++} className="search-match">
        {text.slice(match.index, match.index + match[0].length)}
      </mark>,
    );
    last = match.index + match[0].length;
    if (match[0].length === 0) re.lastIndex += 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
