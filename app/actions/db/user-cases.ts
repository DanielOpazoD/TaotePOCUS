"use server";

// Server Actions for the `user_cases` table — admin-uploaded cases
// (vs. seed/imported cases which live in the bundled corpus). Save
// goes through `requireAuth + ownership check`; admins can act on any
// row, regular users only on their own.

import { getDatabase } from "@netlify/database";
import type { CaseRecord } from "@/lib/types";
import {
  type ActionResult,
  AUTH_REQUIRED,
  FORBIDDEN,
  authorizeUserCase,
  fail,
  recordAdminAction,
  withDbRead,
} from "./_authz";
import { requireAuth } from "@/lib/server/session";

export async function dbListUserCases(): Promise<CaseRecord[]> {
  // **Public read.** Admin-uploaded cases are part of the catalog
  // every visitor sees — just like the seed corpus. Returns BOTH
  // live and trashed in one call so the consumer can partition;
  // mirrors `_cases.listUserRaw` from the localStorage backend.
  return withDbRead(
    "listUserCases",
    async () => {
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
      // CaseRecord shape — that's what the consumer expects.
      return rows.map((r) => ({
        ...r.data,
        id: r.id,
        ...(r.deleted_at ? { deletedAt: r.deleted_at } : {}),
        ...(r.deleted_by ? { deletedBy: r.deleted_by } : {}),
      }));
    },
    [],
  );
}

export async function dbSaveUserCase(
  c: CaseRecord,
  ownerEmail: string | null,
  isUpdate: boolean,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!session) return AUTH_REQUIRED;
  // Force the owner_email to match the session for inserts. Updates
  // run through the ownership check below so a non-admin can't
  // hijack someone else's row by re-saving with their email.
  const enforcedOwner = session.email;
  void ownerEmail; // signature parity; ignored for authz.
  try {
    const db = getDatabase();
    if (isUpdate) {
      const auth = await authorizeUserCase(session, c.id);
      if (!auth.ok) return FORBIDDEN;
      await db.sql`
        UPDATE user_cases
        SET data = ${JSON.stringify(c)}::jsonb,
            owner_email = COALESCE(${auth.ownerEmail}, ${enforcedOwner}),
            updated_at = now()
        WHERE id = ${c.id}
      `;
    } else {
      await db.sql`
        INSERT INTO user_cases (id, data, owner_email)
        VALUES (${c.id}, ${JSON.stringify(c)}::jsonb, ${enforcedOwner})
      `;
    }
    await recordAdminAction("user_case_saved", session.email, c.id, {
      isUpdate,
      title: c.title,
    });
    return { ok: true };
  } catch (err) {
    return fail("saveUserCase", err);
  }
}

export async function dbRemoveUserCase(id: string, byEmail: string | null): Promise<ActionResult> {
  // Soft delete — sets `deleted_at` so the trash view can list it
  // and `restore` can undo. `purge` is the hard-delete counterpart.
  const session = await requireAuth();
  if (!session) return AUTH_REQUIRED;
  const auth = await authorizeUserCase(session, id);
  if (!auth.ok) return FORBIDDEN;
  void byEmail; // signature parity; we use session.email for the audit value.
  const audit = session.email;
  try {
    const db = getDatabase();
    await db.sql`
      UPDATE user_cases
      SET deleted_at = now(), deleted_by = ${audit}
      WHERE id = ${id}
    `;
    await recordAdminAction("user_case_soft_deleted", audit, id, {});
    return { ok: true };
  } catch (err) {
    return fail("removeUserCase", err);
  }
}

export async function dbRestoreUserCase(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!session) return AUTH_REQUIRED;
  const auth = await authorizeUserCase(session, id);
  if (!auth.ok) return FORBIDDEN;
  try {
    const db = getDatabase();
    await db.sql`
      UPDATE user_cases
      SET deleted_at = NULL, deleted_by = NULL
      WHERE id = ${id}
    `;
    await recordAdminAction("user_case_restored", session.email, id, {});
    return { ok: true };
  } catch (err) {
    return fail("restoreUserCase", err);
  }
}

export async function dbPurgeUserCase(id: string): Promise<ActionResult> {
  // Hard delete — removes the row entirely. The original was already
  // in the trash (soft-deleted), so the audit trail is moot.
  const session = await requireAuth();
  if (!session) return AUTH_REQUIRED;
  const auth = await authorizeUserCase(session, id);
  if (!auth.ok) return FORBIDDEN;
  try {
    const db = getDatabase();
    await db.sql`DELETE FROM user_cases WHERE id = ${id}`;
    return { ok: true };
  } catch (err) {
    return fail("purgeUserCase", err);
  }
}
