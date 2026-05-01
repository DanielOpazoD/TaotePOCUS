# ADR 0008 — Canonical `description` field, deprecate the trio

- **Status**: Accepted.
- **Date**: 2026-05-04
- **Decider(s)**: Project lead

## Context

`CaseRecord` carried three narrative fields: `summary`, `findings`,
`diagnosis`. They originated when the modal was structured as a
three-section editorial body (Resumen del caso · Hallazgos
ecográficos · Diagnóstico), each rendered as a labeled paragraph
with its own pull-quote treatment.

In April–May 2026 the modal collapsed to a single "Descripción"
section per user feedback (the trio felt over-structured for the
mostly-short Twitter-imported corpus). The form simplified
correspondingly. To avoid a data migration, the simplified form
kept writing to `findings` — meaning anyone reading the codebase
had to learn that the field labeled "Descripción" is stored under a
name that suggests something else.

That shortcut left a footgun: ten downstream consumers (modal,
card, search, classifier, presentation, JSON-LD, reading-time, etc.)
all hardcoded the fallback chain inline, each with slightly
different ordering. Any contributor trying to delete one of the
deprecated fields would have to chase ten edits to keep them
consistent.

## Decision

Promote `description` to the canonical body field and centralize
the read path:

1. Add `description?: string` on `CaseRecord` (optional so the
   imported corpus stays valid without an immediate migration).
2. Mark `summary`, `findings`, `diagnosis` as `@deprecated` in
   their JSDoc with a pointer to the helper.
3. Add `lib/case-description.ts` exporting:
   - `getDescription(c)` — `description || findings || summary ||
diagnosis || ""`. The single read path everyone uses.
   - `setDescription(text)` — returns `{ description: text }`.
     Always writes to the canonical field; never mirrors to legacy
     slots (mirroring would re-introduce the duplication problem).
4. Migrate every consumer to `getDescription`. List of touchpoints
   in the commit that landed this ADR.

The legacy fields stay on the type and stay populated for the
imported corpus. They are not removed yet because doing so requires
a backfill migration in the DB plus rewriting the imported-cases
generator. See migration plan below.

## Consequences

### Pros

- **One read path.** `getDescription(c)` is the single place where
  the fallback order is defined. Future tweaks to the chain are a
  one-line change.
- **One write path.** The form writes through `update({
description })` and validation reads `getDescription(form)`. New
  cases land cleanly in the canonical field; editing a legacy case
  pre-fills via the fallback so no data is lost.
- **Search index simplifies.** `useCaseFilters` and `ClassifierBoard`
  collapse `[c.title, c.summary, c.findings, c.diagnosis, ...]` to
  `[c.title, getDescription(c), ...]`. Less haystack noise from
  duplicated text in cases that have it in multiple slots.
- **Reading-time stops triple-counting.** `readingTimeFor` used to
  count `summary + findings + diagnosis` separately; it now counts
  the resolved description once.

### Cons

- **Three fields still on the type.** The deprecation is a JSDoc
  annotation, not enforced. A new contributor could still write
  `c.findings = "..."` in plain TS and the compiler wouldn't object.
  Mitigation: all production writes go through the form, which only
  writes `description`. We rely on review to keep new code clean
  until the backfill lands.
- **Slight type-check cost.** The `description?` field defaults to
  `undefined`, and the legacy fields default to whatever the
  imported corpus put there. Tests that assert on rendered text
  must use `description` going forward (the `FeaturedRow` test
  fixture was updated as part of this ADR).

## Migration to "remove the legacy fields" (when this ADR is partly superseded)

1. **Backfill SQL** — for every row in `user_cases` and every patch
   in `case_overrides` whose `description` is null or missing,
   write `description = COALESCE(description, findings, summary,
diagnosis)`.
2. **Backfill the imported corpus** — regenerate `lib/imported-cases.ts`
   with `description` populated from the source tweet text. The
   `scripts/apply-twitter-import.mjs` change is mechanical.
3. **Promote `description` from `string?` to `string`** on
   `CaseRecord`.
4. **Delete `findings`, `summary`, `diagnosis`** from the type and
   from the legacy fallback chain in `getDescription`.
5. **Delete the deprecation comments** in `CaseModal`, `CaseForm`,
   etc. that reference the trio.
6. Write a new ADR superseding this one.

Until those five steps land, every consumer must keep going through
`getDescription` — never read the legacy fields directly.
