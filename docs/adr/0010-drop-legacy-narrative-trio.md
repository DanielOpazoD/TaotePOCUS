# ADR 0010 — Drop the legacy narrative trio (`findings` / `summary` / `diagnosis`)

- **Status**: Accepted (supersedes ADR-0008).
- **Date**: 2026-05-04
- **Decider(s)**: Project lead

## Context

ADR-0008 promoted `description` to the canonical body field on
`CaseRecord`, but kept `findings`, `summary`, and `diagnosis` on the
type as `@deprecated`. `getDescription()` fell through them in order
so the imported corpus (326 cases populated from the @TaotePOCUS
Twitter archive) kept rendering without an immediate migration.

The deprecation was always meant to be temporary. The cost of
leaving it in place:

- Anyone touching the data model still has to learn that the
  "Descripción" textarea writes to a field that no longer formally
  exists, but that the reader still falls back to. Real footgun for
  contributors.
- Tests and fixtures kept three throwaway field values per case for
  no behavioral purpose.
- The Server Action surface in `app/actions/db.ts` accepted the
  deprecated fields on writes via the `data` jsonb blob. Nothing
  prevented a client from sending a wrong combination.
- Future migrations (DB shape, search index, full-text) had to
  reason about four fields where one would do.

ADR-0008 listed a 5-step removal plan; this ADR is the execution.

## Decision

Backfill `description` for every existing data source, then drop
the three legacy fields from the type.

### What landed

**Code** (`commit forthcoming`):

1. `lib/types.ts` — `description` promoted from `string?` to
   `string` (now required). `findings`, `diagnosis`, `summary`
   removed from `CaseRecord`.
2. `lib/case-description.ts` — fallback chain removed.
   `getDescription(c)` is now a one-line `return c.description`.
   The helper stays as the single read seam so future cross-
   cutting transforms (sanitization, localization) land in one
   file. `setDescription()` unchanged.
3. `lib/imported-cases.ts` — every case rewritten via the
   migration script (see below). `findings: "X"` renamed to
   `description: "X"`; `summary` and `diagnosis` lines deleted.
4. `scripts/migrate-description.mjs` (new) — one-off Node script
   that does the rewrite. Idempotent (returns `0 renamed` if run
   again). Handles both single-line and prettier-broken multi-
   line value forms. Kept in the repo so the operation is
   reproducible — anyone restoring an old corpus snapshot can
   re-run.
5. `scripts/apply-twitter-import.mjs` — emits `description` only.
   `parseFields()` returns `{ title, description }` (down from
   four). `diagnosis` is still computed internally because the
   title-derivation logic uses it as a fallback source — but
   never written to the output object.
6. Components that read the legacy fields (`CaseModal`,
   `CaseForm`, `CaseCard`, `FeaturedRow`, `PresentationMode`,
   `ClassifierBoard`, `useCaseFilters`, `case-meta`) — every
   read goes through `getDescription`. The "reveal diagnosis"
   pedagogical mechanic in `PresentationMode` was removed (with
   no separate diagnosis line, there's nothing to reveal); the
   `R` keyboard shortcut and its help-line entry are gone.
7. Tests — `tests/case-description.test.ts` rewritten to pin the
   minimal `c.description` contract; `tests/fixtures.ts` and
   four other test files updated to write `description` instead
   of the trio.

**Database backfill** (run before deploying the type change to
production):

```sql
-- user_cases: backfill description from findings → summary → diagnosis
UPDATE user_cases
SET data = jsonb_set(
  data,
  '{description}',
  to_jsonb(COALESCE(
    NULLIF(data->>'description', ''),
    NULLIF(data->>'findings', ''),
    NULLIF(data->>'summary', ''),
    NULLIF(data->>'diagnosis', ''),
    ''
  )),
  true
)
WHERE data->>'description' IS NULL OR data->>'description' = '';

-- user_cases: drop the legacy keys from the JSON blob
UPDATE user_cases
SET data = data - 'findings' - 'summary' - 'diagnosis';

-- case_overrides: same backfill on the partial-record patch shape
UPDATE case_overrides
SET patch = jsonb_set(
  patch,
  '{description}',
  to_jsonb(COALESCE(
    NULLIF(patch->>'description', ''),
    NULLIF(patch->>'findings', ''),
    NULLIF(patch->>'summary', ''),
    NULLIF(patch->>'diagnosis', ''),
    ''
  )),
  true
)
WHERE (patch ? 'findings' OR patch ? 'summary' OR patch ? 'diagnosis')
  AND (patch->>'description' IS NULL OR patch->>'description' = '');

UPDATE case_overrides
SET patch = patch - 'findings' - 'summary' - 'diagnosis';
```

This SQL is idempotent — running it twice is safe. Add to a
migration file under `netlify/database/migrations/` before the
next production deploy that ships this type change.

## Consequences

### Pros

- **One field, one read, one write.** `getDescription` /
  `setDescription` continue to be the single seam, but the
  underlying contract is now flat: the description IS the
  description.
- **TypeScript enforces it.** `description: string` (required)
  means the form, the imports, the API actions, and the tests all
  carry a value. The compiler rejects writes that try to use the
  old names.
- **Less serialization noise.** Each case is shorter (~60 bytes
  smaller per row in the bundled corpus). The total reduction
  across 326 imported cases is ~20 KB after gzip — modest, but
  also less for the JSON parser to chew on.
- **Reading time + JSON-LD fixed.** `readingTimeFor` and the
  modal's structured-data `description` now reflect the actual
  body once, not three duplicates. The reading-time estimate is
  no longer inflated for cases where the trio was redundant.

### Cons

- **No graceful behavior with stale clients.** A client running
  pre-this-deploy would send a `findings` field on save — the
  Server Action ignores it (only `description` lands in the DB)
  but the client UI shows a stale read until refresh. Mitigation:
  forced reload via the existing service-worker bypass on next
  deploy; not a real concern for an internal tool with admin-only
  writes.
- **The diagnosis-reveal mechanic is gone.** The presentation
  mode used to hide the diagnosis until the user pressed `R` —
  pedagogical for teaching settings. With one description there's
  nothing to reveal. If we want the spoiler pattern back, the
  natural shape is "split description on a configurable marker
  (e.g. `---`)" rather than re-introducing a separate field. Out
  of scope for this ADR.

## Alternatives considered

- **Leave the deprecation in place forever.** Rejected. Every new
  contributor would re-discover the footgun; the cost was paid
  every onboarding, not just at original write time.
- **Migrate `description` ↔ `summary` instead** (use the short
  label as canonical). Rejected: in this corpus `findings` is the
  longest, richest text. Picking summary would have lost
  information.
- **Keep the fields but rename them.** Rejected as ceremony with
  no semantic gain.

## Verification

After this ADR ships:

- `grep -rn "\.findings\b\|\.summary\b\|\.diagnosis\b" --include="*.ts" --include="*.tsx" lib/ components/ hooks/`
  returns no production hits (only the deprecation script and
  the Twitter import's internal `diagnosis` variable for title
  derivation).
- `lib/imported-cases.ts` shows 326 `description:` keys, zero of
  the legacy three.
- All 319 unit tests pass; `tsc --noEmit` succeeds.
