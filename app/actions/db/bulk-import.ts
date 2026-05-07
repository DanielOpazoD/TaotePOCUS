"use server";

// One-shot Server Action used by Backup → Restore-into-DB. Reads the
// entire shape of a backup envelope and upserts everything in a
// single transaction so the migration is atomic — partial state can't
// leak in if something fails midway.

import { getDatabase } from "@netlify/database";
import type { CaseRecord, Category } from "@/lib/types";
import {
  type ActionResult,
  type DbQuery,
  AUTH_REQUIRED,
  FORBIDDEN,
  fail,
  recordAdminAction,
} from "./_authz";
import { requireAdmin, requireAuth } from "@/lib/server/session";

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
  // Bulk import wipes every shared table. Admin-only.
  // We can't use the `withAdmin` helper because the success branch
  // returns an extended shape (`{ counts }`) and the helper widens
  // the failure union with a `forbidden | unknown` shape. Inlining
  // keeps the typing tractable.
  const session = await requireAdmin();
  if (!session) return (await requireAuth()) ? FORBIDDEN : AUTH_REQUIRED;
  void importedBy; // signature parity; we use session.email for the audit value.
  const audit = session.email;
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
          values: [id, JSON.stringify(patch), audit],
        });
        overrides += 1;
      }

      let categories = 0;
      for (const c of payload.customCategories) {
        await query({
          text: `INSERT INTO custom_categories (id, label, created_by)
                 VALUES ($1, $2, $3)`,
          values: [c.id, c.label, audit],
        });
        categories += 1;
      }

      let userCases = 0;
      for (const c of payload.userCases) {
        await query({
          text: `INSERT INTO user_cases (id, data, owner_email, deleted_at, deleted_by)
                 VALUES ($1, $2::jsonb, $3, $4, $5)`,
          values: [c.id, JSON.stringify(c), audit, c.deletedAt ?? null, c.deletedBy ?? null],
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
      const counts = { overrides, categories, userCases, favs };
      // Audit happens AFTER the transaction commits so a rollback
      // doesn't leave a phantom audit row pointing at data that
      // never landed.
      await recordAdminAction("bulk_imported", session.email, null, counts);
      return { ok: true, counts };
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
