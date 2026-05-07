"use server";

// Server Actions for the `case_overrides` table + the related media
// purge endpoints. Per-case admin edits (sección, categoría, tags,
// title, description, soft-delete) live as `Partial<CaseRecord>` rows
// keyed by case id; the merge layer in `lib/repo` applies them on top
// of the seed catalog at render time.
//
// Authz model:
//
//   - `dbListOverrides` is a PUBLIC read. The overrides ARE the
//     catalog (recategorizations, retitles, tombstones); gating them
//     on auth meant anonymous visitors saw the raw seed corpus
//     without any admin edits. Bug history: edbf64d ("public catalog
//     reads no longer require auth").
//   - Every write requires admin role.

import { getDatabase } from "@netlify/database";
import { mediaStore } from "@/lib/blobs";
import type { CaseRecord } from "@/lib/types";
import { type ActionResult, fail, recordAdminAction, withAdmin, withDbRead } from "./_authz";

export async function dbListOverrides(): Promise<Record<string, Partial<CaseRecord>>> {
  return withDbRead(
    "listOverrides",
    async () => {
      const db = getDatabase();
      const rows = await db.sql<{ id: string; patch: Partial<CaseRecord> }>`
        SELECT id, patch FROM case_overrides
      `;
      return Object.fromEntries(rows.map((r) => [r.id, r.patch]));
    },
    {},
  );
}

export async function dbSetOverride(
  id: string,
  patch: Partial<CaseRecord>,
  updatedBy: string | null,
): Promise<ActionResult> {
  void updatedBy; // signature parity; we use session.email for the audit value.
  return withAdmin("setOverride", async (session) => {
    const audit = session.email;
    const db = getDatabase();
    // Merge the inbound patch INTO the existing override row rather
    // than overwriting it. Mirrors the local backend's contract
    // (`lib/repo/local-cases.ts > setOverride`):
    //   - `key: value`   → set/update that key.
    //   - `key: undefined` (which serializes to JSON null) → remove it.
    //   - empty merged result → delete the row entirely.
    //
    // Merge in JS rather than SQL because the "remove when null" rule
    // is awkward in jsonb — reading + computing + writing is cleaner;
    // the row volume is small (≤ catalog size).
    const rows = await db.sql<{ patch: Partial<CaseRecord> }>`
      SELECT patch FROM case_overrides WHERE id = ${id} LIMIT 1
    `;
    const existing: Partial<CaseRecord> = rows[0]?.patch ?? {};
    const merged: Record<string, unknown> = { ...existing };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === null) delete merged[k];
      else merged[k] = v;
    }
    if (Object.keys(merged).length === 0) {
      await db.sql`DELETE FROM case_overrides WHERE id = ${id}`;
      return { ok: true } as ActionResult;
    }
    await db.sql`
      INSERT INTO case_overrides (id, patch, updated_by)
      VALUES (${id}, ${JSON.stringify(merged)}::jsonb, ${audit})
      ON CONFLICT (id) DO UPDATE SET
        patch = EXCLUDED.patch,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by
    `;
    // Audit. Records the patch shape (which keys changed) — full
    // before/after replay isn't stored, only the inbound payload.
    await recordAdminAction("override_set", audit, id, { patch });
    return { ok: true } as ActionResult;
  });
}

export async function dbClearOverride(id: string): Promise<ActionResult> {
  return withAdmin("clearOverride", async (session) => {
    const db = getDatabase();
    await db.sql`DELETE FROM case_overrides WHERE id = ${id}`;
    await recordAdminAction("override_cleared", session.email, id, {});
    return { ok: true } as ActionResult;
  });
}

/**
 * Permanent-delete a seed/imported case. The override is replaced
 * with a tombstone `{ purged: true }` — a small, sticky marker that
 * survives re-imports of `lib/imported-cases.ts` (the merge layer
 * keeps filtering the case out forever) without holding on to all
 * the previous override fields.
 *
 * Optionally also deletes the corresponding blob from the media
 * store. Pass the key extracted from `media.src` (`<id>.<ext>`) when
 * the case had real media; pass `null` for synthetic-loop-only cases.
 *
 * Distinct from `dbPurgeUserCase`, which removes a user-uploaded
 * case row from the `user_cases` table — those don't share an id
 * with the seed catalog.
 */
export async function dbPurgeImported(
  id: string,
  mediaKey: string | null,
  purgedBy: string | null,
): Promise<ActionResult> {
  void purgedBy; // signature parity; we use session.email for the audit value.
  return withAdmin("purgeImported", async (session) => {
    const audit = session.email;
    const db = getDatabase();
    // Replace whatever was in the override with the tombstone. The
    // previous fields are intentionally dropped — nobody's going to
    // see this case again and we don't want them sitting around.
    await db.sql`
      INSERT INTO case_overrides (id, patch, updated_by)
      VALUES (${id}, ${JSON.stringify({ purged: true })}::jsonb, ${audit})
      ON CONFLICT (id) DO UPDATE SET
        patch = EXCLUDED.patch,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by
    `;
    if (mediaKey) {
      // Best-effort. If the blob doesn't exist (already deleted, or
      // the case never had real media), the store throws — we swallow
      // so a failed media delete doesn't roll back the tombstone insert.
      try {
        await mediaStore().delete(mediaKey);
      } catch (mediaErr) {
        console.error("[db.purgeImported] media delete failed", mediaErr);
      }
    }
    await recordAdminAction("import_purged", audit, id, { mediaKey });
    return { ok: true } as ActionResult;
  });
}

/**
 * Stand-alone media delete. Used when the caller already handled the
 * metadata side-effect and just needs to clean up the file.
 */
export async function dbDeleteMedia(key: string): Promise<ActionResult> {
  if (!key) return { ok: true };
  return withAdmin("deleteMedia", async () => {
    try {
      await mediaStore().delete(key);
      return { ok: true } as ActionResult;
    } catch (err) {
      return fail("deleteMedia", err);
    }
  });
}
