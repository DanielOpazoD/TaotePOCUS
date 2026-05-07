-- 0003 — Admin action audit log.
--
-- Records every mutation that flows through `requireAdmin`-gated
-- Server Actions in `app/actions/db.ts`. Append-only; the only
-- consumer is the admin "Actividad" view (read-only) and operator
-- inspection via the Neon SQL editor.
--
-- Two design choices to call out:
--
--   1. **Append-only**. No update / delete API. The retention
--      policy is "keep everything until the table grows" — at the
--      current write rate (one admin, ~10 actions/day) this is
--      thousands of years before it matters. If it ever does, the
--      cleanup is a single TRUNCATE or a periodic DELETE WHERE
--      created_at < now() - interval '1 year'.
--
--   2. **Payload as JSONB**. Different action kinds carry different
--      shapes (`override_set` carries a partial CaseRecord; a
--      `category_remove` carries just an id). One typed column per
--      kind would balloon the schema; one JSONB column lets us
--      record every action without migrations as the action set
--      grows.
--
-- Per ADR-style ID, this migration is fully self-contained and
-- idempotent (CREATE … IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS admin_actions (
  id           BIGSERIAL    PRIMARY KEY,
  -- Action kind. Constrained at the application layer (the wrapper
  -- in `app/actions/db.ts > recordAdminAction`) so the column stays
  -- a free-form text — adding a new kind is one constant in code,
  -- no schema change.
  kind         TEXT         NOT NULL,
  -- Target case / category / section id, when relevant. NULL when
  -- the action doesn't target a single resource (e.g. bulk import).
  target_id    TEXT,
  -- Email of the admin who triggered the action. Pulled from the
  -- session, NOT from a client-supplied parameter — see the
  -- `requireAdmin` checks throughout app/actions/db.ts.
  actor_email  TEXT         NOT NULL,
  -- Free-form JSONB payload describing what changed. For an
  -- override_set this is the patch object; for a soft_delete this
  -- is `{ scope: "user_case" | "override" }`; etc.
  payload      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  -- Outcome. Right now we only insert `ok`; the field is reserved
  -- so future failure-tracking lands here without a migration.
  result       TEXT         NOT NULL DEFAULT 'ok',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Most reads are "the most recent N actions" for the admin
-- activity view. A descending index on created_at serves that
-- pattern in O(log N).
CREATE INDEX IF NOT EXISTS admin_actions_created_at_desc_idx
  ON admin_actions (created_at DESC);

-- Filter-by-actor read: when the operator wants "everything I did
-- this week" or "everything Dr. X did last month".
CREATE INDEX IF NOT EXISTS admin_actions_actor_idx
  ON admin_actions (actor_email);

-- Filter-by-target read: trace back what was done to a specific
-- case across time. Partial index — a NULL target_id means a
-- non-resource action (bulk import, snapshot), worth excluding so
-- the index stays small.
CREATE INDEX IF NOT EXISTS admin_actions_target_idx
  ON admin_actions (target_id)
  WHERE target_id IS NOT NULL;
