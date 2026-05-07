# Runbook: Migration tracker recovery (Netlify Database / Neon)

**Severity**: P1 — production deploys blocked
**Owner**: backend / infra
**Last incident**: 2026-05-01 (commits `d583961` … `8fa0793`)

---

## Symptom

Netlify deploys land green on build but fail in the **Database
migration** step with one of:

```
Database migration failed: error running migrations: running
  migrations: ERROR <NNNN>_<name>.sql: failed to run SQL migration
```

— or, on the next attempt with the same file in place —

```
Database migration failed: migration "<NNNN>_<name>" (version N)
  was added out of order: current database version is N
```

The two messages are the **same incident**, just at different
stages. The first fires when a SQL statement inside the migration
file errors (or commits prematurely); the second fires after the
runner has bumped its tracker even though the SQL didn't fully
apply, leaving the `netlify.migrations` table in an inconsistent
state.

---

## Root cause

Netlify's database migration runner (goose-style) keeps a
**tracker table** in the `netlify` schema that records which
versions have been applied:

```sql
SELECT * FROM netlify.migrations ORDER BY version_id;
-- id | version_id | is_applied
--  1 | -1         | true   ← initial marker, do not touch
--  2 | 1          | true   ← 0001_initial applied legitimately
--  3 | 2          | true   ← phantom: tracker says applied but
--                            the SQL of 0002 didn't actually run
```

The phantom row gets inserted when:

1. A migration file contains `BEGIN ... COMMIT` blocks. The runner
   already wraps each file in its own transaction; the inner
   `COMMIT` closes the outer wrapper prematurely.
2. The runner's bookkeeping insert into `netlify.migrations` runs
   on the (now-already-committed) outer transaction, leaving a
   row claiming the migration is applied even when downstream
   statements failed.

The SQL of the migration file did NOT run. The `migration_checksums`
sister table (where the runner records the file's SHA-256) does
NOT have an entry for the phantom version. The mismatch is what
the `out of order` guard detects on the next deploy.

---

## Diagnosis

Open the Neon SQL editor through Netlify's UI:

> Site → **Database** → click **View/edit** next to the
> `production` branch.

Run:

```sql
-- 1. Inspect the tracker. Look for rows with `version_id` matching
--    the failing migration whose `is_applied = true` but which
--    have no entry in migration_checksums.
SELECT * FROM netlify.migrations ORDER BY version_id;

-- 2. Inspect the checksums sister table.
SELECT version, name, sha256 FROM netlify.migration_checksums;

-- 3. List user data tables to confirm nothing else is broken.
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

The phantom is the row in `netlify.migrations` whose `version_id`
has **no matching row** in `netlify.migration_checksums`.

---

## Fix

**Targeted DELETE on the phantom row.** Do NOT touch the
`(-1, true)` initial marker or any row whose version_id has a
matching entry in `netlify.migration_checksums`.

```sql
-- Replace 2 with the phantom version_id you identified above.
DELETE FROM netlify.migrations WHERE version_id = 2;
```

Verify:

```sql
SELECT * FROM netlify.migrations ORDER BY version_id;
-- Should show 2 rows: (1, -1, true) and (2, 1, true).
-- The phantom is gone.
```

Trigger a new deploy from Netlify (no commit needed):

> Deploys → **Trigger deploy** → **Deploy site**.

The runner will see `current_version = 1`, find your `0002_*.sql`
file in the repo with version 2 > 1, and apply it as a fresh
forward migration. The `netlify.migrations` table will gain a new
row at `version_id = 2` and `netlify.migration_checksums` will
record the file's hash.

---

## Prevention

When writing a migration file:

- **Do NOT include `BEGIN ... COMMIT`** at the file level. The
  runner wraps each file in its own transaction; explicit
  control conflicts with that.
- **Use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`** on every
  schema-mutating statement so a partial re-apply is idempotent.
- **Use `WHERE` clauses on `UPDATE` statements** so re-running
  the migration on already-migrated rows is a no-op.
- **Add `jsonb_typeof(col) = 'object'` guards** on any operation
  that calls `jsonb_set` / `?` / `->>` — a malformed JSONB row
  would otherwise abort the entire migration.

The fix in `0002_backfill_description.sql` after this incident
captures all four points; reference it as a template.

---

## Why we don't drop the file

You may be tempted to delete `0002_*.sql` from the repo to "clear
the history". The runner's `out of order` check would then fire
on the next migration that targets a version after the missing
one, because the file enumeration no longer matches the tracker.
Always **fix the data**, not the filesystem.

---

## Health check

Admin can run a one-shot sanity probe via the Server Action
`dbCheckMigrations()` (see `app/actions/db.ts`). It returns the
current `netlify.migrations` rows alongside `migration_checksums`
so the operator can spot drift without opening the Neon SQL
editor.
