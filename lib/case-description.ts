// Single read/write entry point for the case body text.
//
// Historical context: until May-2026 the CaseRecord carried three
// narrative fields (`summary` + `findings` + `diagnosis`). The UI
// collapsed them into a single "Descripción" section; ADR-0008 added
// `description` as the canonical field with a fallback chain to the
// legacy three; ADR-0010 (this file's current shape) backfilled the
// legacy values into `description` and dropped the trio from the
// type entirely.
//
// Phase-2 i18n (Nov-2026) widened `description` from `string` to
// `LocalizedString = { es; en? }`. The helpers below preserve their
// pre-i18n signatures: `getDescription(c)` keeps returning a plain
// string (the Spanish baseline), `setDescription(text)` keeps
// taking a plain string (writes to the ES slot). Bilingual readers
// go through `getCaseDescription(c, lang)` from
// `lib/case-localized.ts`.
//
// Why preserve the old API:
//   - The Spanish baseline is always present on every case (it's
//     editorial canon), so a "give me the ES body" call is the
//     right shape for search indexing, reading-time estimation,
//     and any other ES-only consumer.
//   - ~10 callers consume `getDescription(c)`. Widening the
//     signature to require `lang` would noise every callsite
//     for no behavioral gain — the old `string` value IS now
//     `c.description.es`.

import { normalizeLocalizedString } from "./case-localized";
import type { CaseRecord, LocalizedString } from "./types";

/**
 * Spanish-baseline read for the case body. Always returns a string
 * (empty when the case has no description). For bilingual callers
 * use `getCaseDescription(c, lang)` from `lib/case-localized.ts`.
 *
 * Defensive: if a malformed case slipped past validation and still
 * carries a plain string in `description`, we normalize on the fly
 * so the contract holds.
 */
export function getDescription(c: CaseRecord): string {
  if (typeof (c.description as unknown) === "string") {
    return c.description as unknown as string;
  }
  return c.description?.es ?? "";
}

/**
 * Build a `Partial<CaseRecord>` patch that sets the Spanish slot of
 * the description. Preserves any existing English translation —
 * editing the ES field shouldn't silently clear the EN field.
 *
 * For dual-language edits use `setLocalizedDescription` below.
 */
export function setDescription(text: string, prev?: LocalizedString): Partial<CaseRecord> {
  const next: LocalizedString = { es: text };
  if (prev?.en && prev.en.length > 0) next.en = prev.en;
  return { description: next };
}

/**
 * Patch builder for setting both language slots at once. `en` is
 * dropped (returned without the key) when the input is empty so
 * the storage layer can treat "no translation" as missing. The
 * input is normalized so callers can pass partial objects.
 */
export function setLocalizedDescription(
  next: LocalizedString | { es?: string; en?: string },
): Partial<CaseRecord> {
  return { description: normalizeLocalizedString(next) };
}
