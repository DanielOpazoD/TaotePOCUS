"use server";

// Server Actions for the `custom_categories` table — admin-defined
// categories that augment the built-in `CATEGORIES` from `lib/data.ts`.
//
// Authz model:
//   - List is a PUBLIC read (the categories show up in the public
//     sidebar; they're metadata, not secrets).
//   - All writes require admin role.

import { getDatabase } from "@netlify/database";
import type { Category } from "@/lib/types";
import { type ActionResult, recordAdminAction, withAdmin, withDbRead } from "./_authz";

export async function dbListCategories(): Promise<Category[]> {
  return withDbRead(
    "listCategories",
    async () => {
      const db = getDatabase();
      const rows = await db.sql<{ id: string; label: string }>`
        SELECT id, label FROM custom_categories ORDER BY created_at ASC
      `;
      return rows.map((r) => ({ id: r.id, label: r.label }));
    },
    [],
  );
}

export async function dbAddCategory(
  id: string,
  label: string,
  createdBy: string | null,
): Promise<ActionResult> {
  // Caller (the repo adapter) generates the slug `id` so the local
  // and DB backends produce identical ids for the same label —
  // makes diffing dual-write states trivial.
  void createdBy; // signature parity; we use session.email for the audit value.
  return withAdmin("addCategory", async (session) => {
    const audit = session.email;
    const db = getDatabase();
    await db.sql`
      INSERT INTO custom_categories (id, label, created_by)
      VALUES (${id}, ${label}, ${audit})
      ON CONFLICT (id) DO NOTHING
    `;
    await recordAdminAction("category_added", audit, id, { label });
    return { ok: true } as ActionResult;
  });
}

export async function dbRenameCategory(id: string, label: string): Promise<ActionResult> {
  return withAdmin("renameCategory", async (session) => {
    const db = getDatabase();
    await db.sql`
      UPDATE custom_categories SET label = ${label} WHERE id = ${id}
    `;
    await recordAdminAction("category_renamed", session.email, id, { label });
    return { ok: true } as ActionResult;
  });
}

export async function dbRemoveCategory(id: string): Promise<ActionResult> {
  return withAdmin("removeCategory", async (session) => {
    const db = getDatabase();
    await db.sql`DELETE FROM custom_categories WHERE id = ${id}`;
    await recordAdminAction("category_removed", session.email, id, {});
    return { ok: true } as ActionResult;
  });
}
