"use server";

// Server Actions for Netlify Database. Each export becomes a POST
// endpoint that the browser bundle can `import + invoke` directly —
// Next.js handles the wire serialization. Server-side execution is
// what lets us reach Postgres, which can't be queried from a browser.
//
// API mirrors `lib/repo.ts` so the dual-write adapter (commit C) is
// a one-to-one mapping. Differences from the localStorage version:
//
// - User-case actions don't accept a `current: CaseRecord[]` array.
//   The DB does upserts / by-id deletes directly; no need for the
//   client to pass the current state.
// - Save returns the inserted row so the client knows the canonical
//   `created_at` / `updated_at` timestamps without a follow-up read.
// - Errors are logged server-side and the action returns
//   `{ ok: false, reason }` rather than throwing — same contract as
//   the existing `WriteResult` so the consumer doesn't change.
//
// All actions assume the schema in `netlify/database/migrations/0001_initial.sql`.

import { getDatabase } from "@netlify/database";
import type { CaseRecord, Category } from "@/lib/types";

/**
 * Typed alias for `pg.PoolClient.query`. The pg `query` is declared
 * as a 4-way overload union whose members aren't intercompatible
 * (overload signatures: stream / queryArrayConfig / queryConfig /
 * positional), and TypeScript's strict mode can't pick one when we
 * call it inline. We cast through this single shape so the rest of
 * the file stays readable.
 *
 * The runtime is unchanged — `pg.PoolClient.query` accepts both the
 * `{ text, values }` form and the positional form. Selecting one
 * shape via the alias keeps the call sites uniform.
 */
type DbQuery = (config: { text: string; values?: unknown[] }) => Promise<unknown>;

/**
 * Discriminated result type. Mirrors `WriteResult` in `lib/store.ts`
 * so dual-write callers can branch the same way regardless of
 * backend. `unknown` covers connection / SQL / serialization errors —
 * the cause lives in the Netlify Function logs, not the response,
 * so we don't leak DB internals to the client.
 */
type ActionResult = { ok: true } | { ok: false; reason: "unknown" };

function fail(area: string, err: unknown): ActionResult {
  // Functions log to Netlify automatically (stdout/stderr capture).
  // We deliberately don't include the SQL string or the error message
  // in the returned shape — those are debugging artefacts and shouldn't
  // round-trip to the client.
  console.error(`[db.${area}]`, err);
  return { ok: false, reason: "unknown" };
}

// ─── case_overrides ──────────────────────────────────────────────

export async function dbListOverrides(): Promise<Record<string, Partial<CaseRecord>>> {
  try {
    const db = getDatabase();
    const rows = await db.sql<{ id: string; patch: Partial<CaseRecord> }>`
      SELECT id, patch FROM case_overrides
    `;
    return Object.fromEntries(rows.map((r) => [r.id, r.patch]));
  } catch (err) {
    fail("listOverrides", err);
    return {};
  }
}

export async function dbSetOverride(
  id: string,
  patch: Partial<CaseRecord>,
  updatedBy: string | null,
): Promise<ActionResult> {
  try {
    const db = getDatabase();
    // Upsert via ON CONFLICT. The cast `::jsonb` is explicit so the
    // driver doesn't have to infer column type from the parameter.
    await db.sql`
      INSERT INTO case_overrides (id, patch, updated_by)
      VALUES (${id}, ${JSON.stringify(patch)}::jsonb, ${updatedBy})
      ON CONFLICT (id) DO UPDATE SET
        patch = EXCLUDED.patch,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by
    `;
    return { ok: true };
  } catch (err) {
    return fail("setOverride", err);
  }
}

export async function dbClearOverride(id: string): Promise<ActionResult> {
  try {
    const db = getDatabase();
    await db.sql`DELETE FROM case_overrides WHERE id = ${id}`;
    return { ok: true };
  } catch (err) {
    return fail("clearOverride", err);
  }
}

// ─── user_cases ──────────────────────────────────────────────────
//
// Returns BOTH live and trashed in one call so the consumer can
// partition (mirrors `_cases.listUserRaw` from the localStorage
// backend, which also returns the full set). The client filters
// `deleted_at` itself when it wants live-only.

export async function dbListUserCases(): Promise<CaseRecord[]> {
  try {
    const db = getDatabase();
    const rows = await db.sql<{
      id: string;
      data: CaseRecord;
      deleted_at: string | null;
      deleted_by: string | null;
    }>`
      SELECT id, data, deleted_at, deleted_by FROM user_cases
      ORDER BY created_at DESC
    `;
    // Promote `deleted_at` / `deleted_by` from columns into the
    // CaseRecord shape, since the consumer expects them in there.
    return rows.map((r) => ({
      ...r.data,
      id: r.id,
      ...(r.deleted_at ? { deletedAt: r.deleted_at } : {}),
      ...(r.deleted_by ? { deletedBy: r.deleted_by } : {}),
    }));
  } catch (err) {
    fail("listUserCases", err);
    return [];
  }
}

export async function dbSaveUserCase(
  c: CaseRecord,
  ownerEmail: string | null,
  isUpdate: boolean,
): Promise<ActionResult> {
  try {
    const db = getDatabase();
    if (isUpdate) {
      await db.sql`
        UPDATE user_cases
        SET data = ${JSON.stringify(c)}::jsonb,
            owner_email = COALESCE(${ownerEmail}, owner_email),
            updated_at = now()
        WHERE id = ${c.id}
      `;
    } else {
      await db.sql`
        INSERT INTO user_cases (id, data, owner_email)
        VALUES (${c.id}, ${JSON.stringify(c)}::jsonb, ${ownerEmail})
      `;
    }
    return { ok: true };
  } catch (err) {
    return fail("saveUserCase", err);
  }
}

export async function dbRemoveUserCase(id: string, byEmail: string | null): Promise<ActionResult> {
  // Soft delete — sets `deleted_at` so the trash view can list it
  // and `restore` can undo. `purge` is the hard-delete counterpart.
  try {
    const db = getDatabase();
    await db.sql`
      UPDATE user_cases
      SET deleted_at = now(), deleted_by = ${byEmail}
      WHERE id = ${id}
    `;
    return { ok: true };
  } catch (err) {
    return fail("removeUserCase", err);
  }
}

export async function dbRestoreUserCase(id: string): Promise<ActionResult> {
  try {
    const db = getDatabase();
    await db.sql`
      UPDATE user_cases
      SET deleted_at = NULL, deleted_by = NULL
      WHERE id = ${id}
    `;
    return { ok: true };
  } catch (err) {
    return fail("restoreUserCase", err);
  }
}

export async function dbPurgeUserCase(id: string): Promise<ActionResult> {
  // Hard delete — removes the row entirely. The original was already
  // in the trash (soft-deleted), so the audit trail is moot.
  try {
    const db = getDatabase();
    await db.sql`DELETE FROM user_cases WHERE id = ${id}`;
    return { ok: true };
  } catch (err) {
    return fail("purgeUserCase", err);
  }
}

// ─── custom_categories ──────────────────────────────────────────

export async function dbListCategories(): Promise<Category[]> {
  try {
    const db = getDatabase();
    const rows = await db.sql<{ id: string; label: string }>`
      SELECT id, label FROM custom_categories ORDER BY created_at ASC
    `;
    return rows.map((r) => ({ id: r.id, label: r.label }));
  } catch (err) {
    fail("listCategories", err);
    return [];
  }
}

export async function dbAddCategory(
  id: string,
  label: string,
  createdBy: string | null,
): Promise<ActionResult> {
  // Caller (the repo adapter) generates the slug `id` so the local
  // and DB backends produce identical ids for the same label —
  // makes diffing dual-write states trivial.
  try {
    const db = getDatabase();
    await db.sql`
      INSERT INTO custom_categories (id, label, created_by)
      VALUES (${id}, ${label}, ${createdBy})
      ON CONFLICT (id) DO NOTHING
    `;
    return { ok: true };
  } catch (err) {
    return fail("addCategory", err);
  }
}

export async function dbRenameCategory(id: string, label: string): Promise<ActionResult> {
  try {
    const db = getDatabase();
    await db.sql`
      UPDATE custom_categories SET label = ${label} WHERE id = ${id}
    `;
    return { ok: true };
  } catch (err) {
    return fail("renameCategory", err);
  }
}

export async function dbRemoveCategory(id: string): Promise<ActionResult> {
  try {
    const db = getDatabase();
    await db.sql`DELETE FROM custom_categories WHERE id = ${id}`;
    return { ok: true };
  } catch (err) {
    return fail("removeCategory", err);
  }
}

// ─── favorites ──────────────────────────────────────────────────

export async function dbListFavs(email: string | null): Promise<string[]> {
  try {
    const db = getDatabase();
    const key = email || "guest";
    const rows = await db.sql<{ case_id: string }>`
      SELECT case_id FROM favorites WHERE email = ${key}
      ORDER BY created_at ASC
    `;
    return rows.map((r) => r.case_id);
  } catch (err) {
    fail("listFavs", err);
    return [];
  }
}

export async function dbSetFavs(email: string | null, ids: string[]): Promise<ActionResult> {
  // Replace strategy: wipe the email's row set and insert the new
  // list. Simpler than diffing client-side and the table is tiny per
  // user. Wrapped in a transaction so a partial failure can't leave
  // the favorites half-written.
  try {
    const db = getDatabase();
    const key = email || "guest";
    const client = await db.pool.connect();
    // Cast once — see `DbQuery` at the top for the rationale.
    const query = client.query.bind(client) as unknown as DbQuery;
    try {
      await query({ text: "BEGIN" });
      await query({ text: "DELETE FROM favorites WHERE email = $1", values: [key] });
      if (ids.length > 0) {
        // One INSERT per id is fine at this scale (favorites lists
        // are small, dozens at most). If it ever grows, batch with
        // the `sql.values` helper.
        for (const id of ids) {
          await query({
            text: "INSERT INTO favorites (email, case_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            values: [key, id],
          });
        }
      }
      await query({ text: "COMMIT" });
      return { ok: true };
    } catch (err) {
      await query({ text: "ROLLBACK" });
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return fail("setFavs", err);
  }
}

// ─── bulk import ────────────────────────────────────────────────
//
// One-shot endpoint used by the Backup → Restore-into-DB flow
// (commit D). Reads the entire shape of a backup envelope and
// upserts everything in a single transaction so the migration is
// atomic — partial state can't leak in if something fails midway.

export interface BulkImportPayload {
  caseOverrides: Record<string, Partial<CaseRecord>>;
  customCategories: Category[];
  userCases: CaseRecord[];
  favsByEmail: Record<string, string[]>;
}

export async function dbBulkImport(
  payload: BulkImportPayload,
  importedBy: string | null,
): Promise<ActionResult & { counts?: Record<string, number> }> {
  try {
    const db = getDatabase();
    const client = await db.pool.connect();
    const query = client.query.bind(client) as unknown as DbQuery;
    try {
      await query({ text: "BEGIN" });

      // Wipe everything first — REPLACE strategy mirrors the Backup
      // restore semantics on the localStorage side. If the admin
      // wanted a merge, they'd edit the JSON before import.
      await query({ text: "DELETE FROM favorites" });
      await query({ text: "DELETE FROM user_cases" });
      await query({ text: "DELETE FROM custom_categories" });
      await query({ text: "DELETE FROM case_overrides" });

      let overrides = 0;
      for (const [id, patch] of Object.entries(payload.caseOverrides)) {
        await query({
          text: `INSERT INTO case_overrides (id, patch, updated_by)
                 VALUES ($1, $2::jsonb, $3)`,
          values: [id, JSON.stringify(patch), importedBy],
        });
        overrides += 1;
      }

      let categories = 0;
      for (const c of payload.customCategories) {
        await query({
          text: `INSERT INTO custom_categories (id, label, created_by)
                 VALUES ($1, $2, $3)`,
          values: [c.id, c.label, importedBy],
        });
        categories += 1;
      }

      let userCases = 0;
      for (const c of payload.userCases) {
        await query({
          text: `INSERT INTO user_cases (id, data, owner_email, deleted_at, deleted_by)
                 VALUES ($1, $2::jsonb, $3, $4, $5)`,
          values: [c.id, JSON.stringify(c), importedBy, c.deletedAt ?? null, c.deletedBy ?? null],
        });
        userCases += 1;
      }

      let favs = 0;
      for (const [email, ids] of Object.entries(payload.favsByEmail)) {
        for (const id of ids) {
          await query({
            text: `INSERT INTO favorites (email, case_id)
                   VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            values: [email, id],
          });
          favs += 1;
        }
      }

      await query({ text: "COMMIT" });
      return {
        ok: true,
        counts: { overrides, categories, userCases, favs },
      };
    } catch (err) {
      await query({ text: "ROLLBACK" });
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return fail("bulkImport", err);
  }
}
