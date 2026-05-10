"use server";

// Server Actions for the `focus_defaults` table — admin-managed
// thumbnail focal-point + zoom defaults at three scopes (global,
// per-section, per-category).
//
// Authz model:
//   - Read is PUBLIC. Anonymous visitors hit it on first paint so the
//     framing is consistent regardless of session — same posture as
//     the categories / overrides reads (catalog metadata, not secrets).
//   - Write requires admin role. Audited via `recordAdminAction`.
//
// Single-row table — see `netlify/database/migrations/0004_focus_defaults.sql`
// for the schema rationale. The action surface is two endpoints
// (read whole blob / write whole blob), matching how the hook
// (`useFocusDefaults`) already manipulates state.

import { getDatabase } from "@netlify/database";
import type { FocusDefaults } from "@/lib/types";
import { type ActionResult, recordAdminAction, withAdmin, withDbRead } from "./_authz";

interface FocusDefaultsRow {
  value: FocusDefaults;
}

/**
 * Read the singleton focus_defaults row. Returns `{}` when the row
 * is missing or the blob isn't an object — defensive, the renderer
 * survives garbage by falling through to its hardcoded centered
 * defaults.
 *
 * Public read (per ADR-0006) — every visitor needs the framing on
 * first paint. The fallback `{}` matches the fresh-install state
 * so a DB-down deploy still renders thumbnails.
 */
export async function dbGetFocusDefaults(): Promise<FocusDefaults> {
  return withDbRead(
    "getFocusDefaults",
    async () => {
      const db = getDatabase();
      const rows = await db.sql<FocusDefaultsRow>`
        SELECT value FROM focus_defaults WHERE id = 1 LIMIT 1
      `;
      if (rows.length === 0) return {};
      const value = rows[0]?.value;
      if (!value || typeof value !== "object") return {};
      return value;
    },
    {},
  );
}

/**
 * Replace the singleton focus_defaults blob. Admin-only. Atomic at
 * the row level — Postgres applies the UPSERT in one statement, so
 * there's no half-written state visible to a concurrent reader.
 *
 * The caller is responsible for sanitizing the payload before it
 * gets here (the hook's `usePersistedState` deserializer covers
 * the read path; the per-setter clamps cover the write path). The
 * server still re-stringifies through `::jsonb` so a malformed
 * payload would fail at the DB layer rather than corrupting the row.
 */
export async function dbSetFocusDefaults(value: FocusDefaults): Promise<ActionResult> {
  return withAdmin("setFocusDefaults", async (session) => {
    const audit = session.email;
    const db = getDatabase();
    const json = JSON.stringify(value);
    await db.sql`
      INSERT INTO focus_defaults (id, value, updated_at, updated_by)
      VALUES (1, ${json}::jsonb, now(), ${audit})
      ON CONFLICT (id) DO UPDATE SET
        value      = EXCLUDED.value,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by
    `;
    // Audit the high-level shape only — the actual blob can have many
    // slots and changes; logging "what changed" granularly would
    // require a per-call diff. Keeping the kind generic + payload
    // summary is enough to answer "did the admin touch focus
    // defaults today?".
    const summary = {
      hasGlobal: Boolean(value.global),
      sectionCount: value.sections ? Object.keys(value.sections).length : 0,
      categoryCount: value.categories ? Object.keys(value.categories).length : 0,
    };
    await recordAdminAction("focus_defaults_updated", audit, null, summary);
    return { ok: true } as ActionResult;
  });
}
