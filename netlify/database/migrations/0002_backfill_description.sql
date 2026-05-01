-- 0002 — Backfill canonical `description` and drop the legacy trio
-- (`findings` / `summary` / `diagnosis`) from every JSON blob.
--
-- Per ADR-0010. Run before deploying the type change that removes
-- the trio from `CaseRecord`. Idempotent: re-running on already-
-- migrated data is a no-op.
--
-- Two tables touched:
--   - `user_cases.data` — full CaseRecord blob.
--   - `case_overrides.patch` — partial CaseRecord patch.

BEGIN;

-- ─── user_cases ───────────────────────────────────────────────
-- Step 1: backfill description from the legacy chain when description
-- is missing or empty. Order matches ADR-0008's fallback (description
-- itself first as a safety, then findings → summary → diagnosis).
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

-- Step 2: drop the legacy keys. `-` is jsonb's "remove key" operator.
UPDATE user_cases
SET data = data - 'findings' - 'summary' - 'diagnosis'
WHERE data ? 'findings' OR data ? 'summary' OR data ? 'diagnosis';

-- ─── case_overrides ───────────────────────────────────────────
-- The override patches are sparse — most cases only set a couple
-- of fields. Backfill only when a legacy narrative key is present
-- AND description is missing on the patch.
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
SET patch = patch - 'findings' - 'summary' - 'diagnosis'
WHERE patch ? 'findings' OR patch ? 'summary' OR patch ? 'diagnosis';

COMMIT;
