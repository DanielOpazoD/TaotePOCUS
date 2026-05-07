"use server";

// Server Actions for the `favorites` table. Per-user lists keyed by
// email; anonymous visitors share the synthetic `"guest"` bucket.
//
// Authz model:
//   - Reads require auth. Non-admins can only read their own bucket
//     or the shared `"guest"` bucket.
//   - Writes require auth + ownership. Non-admins can only mutate
//     their own bucket; the guest bucket is writable by anyone
//     authenticated (matches the legacy local behavior).
//
// The setFavs action uses a transaction so a partial failure can't
// leave the favorites half-written.

import { getDatabase } from "@netlify/database";
import { isOwner, requireAuth } from "@/lib/server/session";
import { type ActionResult, type DbQuery, AUTH_REQUIRED, FORBIDDEN, fail } from "./_authz";

export async function dbListFavs(email: string | null): Promise<string[]> {
  const session = await requireAuth();
  if (!session) return [];
  // Non-admins can only read their own favorites. Guest reads (no
  // email) are allowed for everyone — the "guest" bucket is shared.
  const key = email || "guest";
  if (key !== "guest" && session.role !== "admin" && !isOwner(session, key)) return [];
  try {
    const db = getDatabase();
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
  const session = await requireAuth();
  if (!session) return AUTH_REQUIRED;
  const key = email || "guest";
  // Non-admins can only mutate their own favorites. Guest bucket is
  // writable by anyone authenticated (matches legacy local behavior).
  if (key !== "guest" && session.role !== "admin" && !isOwner(session, key)) return FORBIDDEN;
  try {
    const db = getDatabase();
    const client = await db.pool.connect();
    // Cast once — see `DbQuery` in _authz for the rationale.
    const query = client.query.bind(client) as unknown as DbQuery;
    try {
      await query({ text: "BEGIN" });
      await query({ text: "DELETE FROM favorites WHERE email = $1", values: [key] });
      if (ids.length > 0) {
        // One INSERT per id is fine at this scale (favorites lists are
        // small, dozens at most). If it ever grows, batch with the
        // `sql.values` helper.
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
