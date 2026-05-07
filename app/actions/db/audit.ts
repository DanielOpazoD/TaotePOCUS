"use server";

// Read the most-recent admin actions. Exposed via the admin
// "Actividad" view. Limit + offset for cheap pagination; the
// `created_at_desc` index makes both fast.

import { getDatabase } from "@netlify/database";
import { withAdmin } from "./_authz";

export interface AdminActionRow {
  id: number;
  kind: string;
  target_id: string | null;
  actor_email: string;
  payload: Record<string, unknown>;
  result: string;
  created_at: string;
}

export async function dbListAdminActions(
  limit = 100,
  offset = 0,
): Promise<
  | { ok: true; rows: AdminActionRow[] }
  | { ok: false; reason: "auth_required" | "forbidden" | "unknown" }
> {
  // Clamp the limit so an admin can't accidentally pull every row
  // and slow the page down.
  const safeLimit = Math.max(1, Math.min(500, limit));
  const safeOffset = Math.max(0, offset);
  return withAdmin("listAdminActions", async () => {
    const db = getDatabase();
    const rows = await db.sql<AdminActionRow>`
      SELECT id, kind, target_id, actor_email, payload, result,
             created_at::text AS created_at
      FROM admin_actions
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
      OFFSET ${safeOffset}
    `;
    return { ok: true as const, rows };
  });
}
