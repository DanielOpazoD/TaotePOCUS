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
// The `getDescription` / `setDescription` helpers are now one-line
// indirections — but they stay because the indirection point
// matters: future migrations (e.g. localizing the body, splitting
// rich text from plaintext) will land here without touching every
// consumer. Removing the helpers in favor of direct `c.description`
// access would scatter the seam across ~10 files again.

import type { CaseRecord } from "./types";

/**
 * Canonical read for the case body text. Returns `c.description`
 * directly. The function shape is preserved (rather than asking
 * consumers to read `c.description` themselves) so the codebase
 * has one place to add cross-cutting transforms — caching,
 * localization, sanitization — without touching every component.
 */
export function getDescription(c: CaseRecord): string {
  return c.description;
}

/**
 * Build the `Partial<CaseRecord>` patch for setting a description.
 * Symmetric with `getDescription`; gives every form / inline
 * editor one named call instead of an inline object literal.
 */
export function setDescription(text: string): Partial<CaseRecord> {
  return { description: text };
}
