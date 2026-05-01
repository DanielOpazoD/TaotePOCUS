-- 0003 — Retry of the 0002 backfill, hardened.
--
-- The first attempt (`0002_backfill_description.sql`, deploy
-- `d583961` at 1:50 PM) failed mid-apply: the runner reported
-- `failed to run SQL migration`. Subsequent deploys then errored with
-- `migration "0002_backfill_description" (version 2) was added out
-- of order: current database version is 2` — Netlify's tracker had
-- bumped the DB version to 2 even though the SQL didn't fully apply,
-- and now sees the on-disk 0002 as a phantom "new" migration at
-- version 2. The standard fix is to leave the recorded 0002 alone
-- and add a new migration on top.
--
-- Two changes vs. 0002:
--
--   1. NO EXPLICIT BEGIN/COMMIT. Netlify's migration runner wraps
--      each file in its own transaction; an inner `BEGIN ... COMMIT`
--      pair is the most likely culprit for the original failure
--      (the inner COMMIT can commit the outer wrapper prematurely,
--      and the runner's bookkeeping update afterward sees no active
--      transaction).
--   2. `jsonb_typeof(...) = 'object'` GUARDS. Belt-and-suspenders so
--      a malformed JSONB row (shouldn't exist, but if it did) can't
--      take the migration down. `jsonb_set` errors when the target
--      isn't an object; the guard skips those rows instead.
--
-- The body is otherwise identical to 0002 and fully idempotent — the
-- WHERE clauses skip rows that already have a non-empty `description`
-- and rows that no longer carry the legacy keys. So whether the 0002
-- run actually touched any data is moot: this migration converges
-- the catalog to the post-ADR-0010 shape regardless.

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
