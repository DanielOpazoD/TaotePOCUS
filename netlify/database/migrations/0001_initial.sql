-- Initial schema for Taote POCUS.
--
-- Mirrors the four buckets that today live in the browser's
-- localStorage:
--
--   case_overrides     ←→  pocus_case_overrides
--   custom_categories  ←→  customCategories
--   user_cases         ←→  pocus_user_cases
--   favorites          ←→  pocus_favs_<email>
--
-- The migration is idempotent under the Netlify CLI lifecycle (each
-- file is applied exactly once and recorded by the platform). For
-- safety we still gate every CREATE with IF NOT EXISTS so a partial
-- failure mid-apply doesn't leave the schema in a half-state that the
-- next run can't reconcile.
--
-- Design notes:
--
-- 1. SINGLE-TENANT. The site has one admin (the owner). Tables are
--    global per Netlify project; `updated_by` / `owner_email` are
--    informational, not enforcement. If multi-admin lights up later,
--    the columns are already there to scope on.
--
-- 2. JSONB FOR FLEXIBLE BLOBS, COLUMNS FOR FILTERS. The shape of
--    `CaseRecord` evolves often (new fields like `reviewed`,
--    `deletedAt`, `lastUpdated` appeared mid-project). Storing the
--    body as JSONB lets us add fields without writing a migration
--    every time. We promote to top-level columns only the fields we
--    filter or sort on (id, owner_email, deleted_at) so the indexes
--    can do their job.
--
-- 3. SOFT-DELETE STAYS SOFT. `user_cases.deleted_at` mirrors the
--    existing client-side trash flow. Public queries filter it out;
--    the admin trash view selects WHERE deleted_at IS NOT NULL.
--    Imported (seed) cases don't live here at all — their
--    "deletedAt" lives inside the `case_overrides.patch` JSON,
--    consistent with how the override pattern already works.

-- ─── case_overrides ──────────────────────────────────────────────
-- Per-case admin edits applied on top of the immutable seed catalog
-- (`lib/imported-cases.ts`). Survives re-imports because overrides
-- live here, not in the source file. The full payload is a
-- `Partial<CaseRecord>` so any field can be overridden — title,
-- section, category, tags, reviewed, deletedAt — without schema
-- changes.
CREATE TABLE IF NOT EXISTS case_overrides (
  id          TEXT        PRIMARY KEY,
  patch       JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

-- Index for the "soft-deleted imports" admin view. Filters cases
-- with a non-null `deletedAt` inside the patch blob. PostgreSQL can
-- index expressions on JSONB, so this stays fast even with thousands
-- of overrides.
CREATE INDEX IF NOT EXISTS case_overrides_trashed_idx
  ON case_overrides ((patch ->> 'deletedAt'))
  WHERE patch ? 'deletedAt';

-- ─── custom_categories ───────────────────────────────────────────
-- Admin-defined categories that augment the eight built-ins from
-- `lib/data.ts`. Custom ids carry the `c:` prefix (slugified label)
-- by convention; we don't enforce it at the DB layer because the
-- prefix is a UX hint, not a contract.
CREATE TABLE IF NOT EXISTS custom_categories (
  id          TEXT        PRIMARY KEY,
  label       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT
);

-- ─── user_cases ──────────────────────────────────────────────────
-- Admin-uploaded cases. Distinct from imported (seed) cases because
-- they have an actual `Media` payload (image / video / GIF) the
-- admin attached, and they're authored from inside the app instead
-- of imported via `apply-twitter-import.mjs`.
--
-- `data` is the full CaseRecord. We could split it into columns
-- (title TEXT, section TEXT, etc.) but the JSONB approach is
-- intentional: the admin form is the only writer, and most fields
-- aren't queried server-side — only `id`, `owner_email`, and
-- `deleted_at` are. Anything else that needs an index later can be
-- promoted in a follow-up migration without touching this one.
CREATE TABLE IF NOT EXISTS user_cases (
  id            TEXT        PRIMARY KEY,
  data          JSONB       NOT NULL,
  owner_email   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  deleted_by    TEXT
);

-- Public reads filter to non-deleted cases. A partial index keeps
-- those queries scanning only the live rows even when the trash is
-- large.
CREATE INDEX IF NOT EXISTS user_cases_live_idx
  ON user_cases (id)
  WHERE deleted_at IS NULL;

-- Owner lookup (future multi-admin scoping). Keeps the index small
-- when most cases share an owner — the table is single-tenant today.
CREATE INDEX IF NOT EXISTS user_cases_owner_idx
  ON user_cases (owner_email);

-- ─── favorites ───────────────────────────────────────────────────
-- Per-user starred cases. Email is the user identity (matches the
-- localStorage key shape `pocus_favs_<email>`). Compound primary key
-- enforces uniqueness — adding the same fav twice is a no-op upsert.
CREATE TABLE IF NOT EXISTS favorites (
  email       TEXT        NOT NULL,
  case_id     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email, case_id)
);

-- Reads scope by email ("show me my favs") so this is the index
-- every query hits.
CREATE INDEX IF NOT EXISTS favorites_by_email_idx
  ON favorites (email);
