-- Admin-managed thumbnail focus defaults — server-side persistence.
--
-- Companion to `localStorage["pocus_focus_defaults"]` on the client.
-- The hook (`hooks/useFocusDefaults`) DB-first reads on mount and
-- mirrors every admin write back here so non-admin visitors inherit
-- the framing from any device.
--
-- Single-row design: the entire `FocusDefaults` blob (global +
-- per-section + per-category overrides) lives in one JSONB column.
-- Two reasons:
--
--   1. The blob is bounded — at most 1 + 5 + N entries (one global,
--      five sections, plus the catalog's custom categories), each
--      a tiny `{x?, y?, scale?}` object. Splitting into rows would
--      add bookkeeping (foreign keys to sections / categories,
--      cascade deletes) without unlocking any query we'd actually
--      run.
--
--   2. The hook always writes the whole blob — its setters are
--      "patch the blob, replace the slot" — so a single UPSERT
--      maps cleanly to the API surface. No per-slot insert/update
--      coordination.
--
-- The CHECK on `id = 1` enforces "exactly one row" without a separate
-- enum / sequence. The Server Action UPSERTs against `id=1`.

CREATE TABLE IF NOT EXISTS focus_defaults (
  id          INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  value       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

-- Seed the singleton row so SELECT can rely on its existence
-- without an ON CONFLICT branch in the read path. The first admin
-- write replaces the empty `{}` with their full payload.
INSERT INTO focus_defaults (id, value)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
