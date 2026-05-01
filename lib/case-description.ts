// Single source of truth for "what is the case body text?".
//
// Until May-2026 a CaseRecord carried three narrative fields:
//
//   - `summary`    — short clinical context
//   - `findings`   — what's visible in the image
//   - `diagnosis`  — the conclusion
//
// User feedback collapsed those three labeled sections into a single
// "Descripción" — see CaseModal / CaseForm. The form was wired to
// keep writing to `findings` for back-compat with the imported
// corpus (326 cases populate `findings` and nothing else). That
// shortcut left a footgun: any new contributor touching the data
// model has to know that "Descripción" maps to `findings`, which is
// neither what the UI says nor what the field name suggests.
//
// This module fixes the footgun:
//
//   - `description` is now a first-class optional field on CaseRecord
//     (see `lib/types.ts`). New writes go there directly.
//   - `getDescription(c)` is the canonical read. It returns
//     `description` when present, falling through `findings → summary
//     → diagnosis → ""` so legacy data keeps rendering. Every consumer
//     in the app (modal, card, search, presentation, classifier, etc.)
//     should call this instead of reading the underlying fields.
//
// Once a backfill migration writes `description` for every legacy row
// (`UPDATE user_cases SET data = jsonb_set(data, '{description}',
// data->>'findings')` or equivalent in the override map), the legacy
// fields can be dropped from the type.

import type { CaseRecord } from "./types";

/**
 * Canonical read for the case body text. Always returns a string —
 * empty when the case has no description in any field, so callers
 * can render conditionally without nullish-coalesce dance.
 *
 * Order of preference matches the migration story:
 *
 *   1. `description`  — the new field, written by the simplified form.
 *   2. `findings`     — where the imported corpus stores its text.
 *   3. `summary`      — earlier user-uploaded cases used this slot.
 *   4. `diagnosis`    — last-resort fallback for the rare case where
 *                       only the diagnosis line was filled.
 */
export function getDescription(c: CaseRecord): string {
  return c.description || c.findings || c.summary || c.diagnosis || "";
}

/**
 * Build the `Partial<CaseRecord>` patch for setting a description.
 * Always writes to the canonical `description` field. Use this from
 * the form / inline editors so the whole codebase moves in lockstep.
 */
export function setDescription(text: string): Partial<CaseRecord> {
  return { description: text };
}
