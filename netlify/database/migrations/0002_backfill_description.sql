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
--
-- ─── History ──────────────────────────────────────────────────
-- The first version of this file wrapped its body in `BEGIN ...
-- COMMIT`. That triggered "failed to run SQL migration" on Netlify's
-- production deploy (`d583961`, 1:50 PM May 1) — the runner already
-- wraps each file in its own transaction, so the inner COMMIT
-- closed the outer wrapper prematurely and left the tracker in an
-- inconsistent state (DB version stuck at 2 with the migration
-- not actually applied).
--
-- The fix is two-pronged:
--
--   1. Restore the DB from the last clean backup (12:35 PM May 1,
--      `9eac18f`). That clears the phantom version-2 record so this
--      file gets a fresh apply.
--   2. Drop the explicit `BEGIN ... COMMIT` here. Let the runner
--      manage the transaction. Add `jsonb_typeof(...) = 'object'`
--      guards on every UPDATE so a malformed JSONB row (shouldn't
--      exist, but if it ever did) can't crash the run.

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
WHERE jsonb_typeof(data) = 'object'
  AND (data->>'description' IS NULL OR data->>'description' = '');

-- Step 2: drop the legacy keys. `-` is jsonb's "remove key" operator.
UPDATE user_cases
SET data = data - 'findings' - 'summary' - 'diagnosis'
WHERE jsonb_typeof(data) = 'object'
  AND (data ? 'findings' OR data ? 'summary' OR data ? 'diagnosis');

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
WHERE jsonb_typeof(patch) = 'object'
  AND (patch ? 'findings' OR patch ? 'summary' OR patch ? 'diagnosis')
  AND (patch->>'description' IS NULL OR patch->>'description' = '');

UPDATE case_overrides
SET patch = patch - 'findings' - 'summary' - 'diagnosis'
WHERE jsonb_typeof(patch) = 'object'
  AND (patch ? 'findings' OR patch ? 'summary' OR patch ? 'diagnosis');
