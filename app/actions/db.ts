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
//
// ─── Authorization ──────────────────────────────────────────────
//
// Every action below consults `lib/server/session` to check the
// caller's identity. The session is a signed httpOnly cookie minted
// by `app/actions/session.ts > setSessionAction` at login and
// invalidated at logout. We deliberately ignore any client-supplied
// "actor" parameter for authz — it's only used as the audit-trail
// `updated_by` / `deleted_by` value, and we cross-check it against
// the session before persisting.
//
// Authorization model:
//
//   - Reads (`db*List*`) are gated by `requireAuth` and silently
//     return empty when unauthenticated, so the dual-write adapter
//     gracefully falls back to local. (The local backend has its own
//     read path via `dbFirst`.)
//   - Admin-only writes (overrides, categories, bulk import, blob
//     deletes) require `requireAdmin`.
//   - Per-user writes (user_cases, favorites) require `requireAuth`
//     and check ownership: a non-admin can only mutate rows whose
//     `owner_email` matches their session.

import { getDatabase } from "@netlify/database";
import { mediaStore } from "@/lib/blobs";
import type { CaseRecord, Category } from "@/lib/types";
import { isOwner, requireAdmin, requireAuth, type SessionPayload } from "@/lib/server/session";

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
 * backend.
 *
 *   - `unknown`         — connection / SQL / serialization errors.
 *                         The cause lives in the Netlify Function
 *                         logs, not the response — we don't leak DB
 *                         internals to the client.
 *   - `auth_required`   — caller has no valid session cookie.
 *   - `forbidden`       — caller is authenticated but not authorized
 *                         for this action (non-admin on an admin
 *                         endpoint, or non-owner mutating someone
 *                         else's row).
 *
 * Dual-write consumers (`lib/repo/dual-write.ts`) await this
 * result and surface the failure to the UI synchronously — the
 * pre-ADR-0011 "fire-and-forget mirror + rate-limited toast"
 * pattern is gone.
 */
type ActionResult = { ok: true } | { ok: false; reason: "unknown" | "auth_required" | "forbidden" };

function fail(area: string, err: unknown): ActionResult {
  // Functions log to Netlify automatically (stdout/stderr capture).
  // We deliberately don't include the SQL string or the error message
  // in the returned shape — those are debugging artefacts and shouldn't
  // round-trip to the client.
  console.error(`[db.${area}]`, err);
  return { ok: false, reason: "unknown" };
}

const AUTH_REQUIRED: ActionResult = { ok: false, reason: "auth_required" };
const FORBIDDEN: ActionResult = { ok: false, reason: "forbidden" };

/**
 * Confirm the row at `id` in `user_cases` belongs to `session.email`.
 * Returns the resolved owner_email so callers can pass it as the
 * audit field without re-querying. `null` means "row doesn't exist
 * or doesn't belong to caller" — treat as forbidden.
 *
 * Admins always pass the check. Non-admins must own the row.
 */
async function loadUserCaseOwner(
  db: ReturnType<typeof getDatabase>,
  id: string,
): Promise<string | null> {
  const rows = await db.sql<{ owner_email: string | null }>`
    SELECT owner_email FROM user_cases WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rows[0]?.owner_email ?? null;
}

async function authorizeUserCase(
  session: SessionPayload,
  id: string,
): Promise<{ ok: true; ownerEmail: string | null } | { ok: false; reason: "forbidden" }> {
  if (session.role === "admin") {
    // Admins can act on any user case. We still try to load the row
    // so the audit trail can carry the original owner if there is one.
    const db = getDatabase();
    return { ok: true, ownerEmail: await loadUserCaseOwner(db, id) };
  }
  const db = getDatabase();
  const owner = await loadUserCaseOwner(db, id);
  if (owner === null) {
    // Either the row doesn't exist (treat as forbidden — don't leak
    // existence) or it has no owner (orphan — only admins touch those).
    return { ok: false, reason: "forbidden" };
  }
  if (!isOwner(session, owner)) return { ok: false, reason: "forbidden" };
  return { ok: true, ownerEmail: owner };
}

// ─── case_overrides ──────────────────────────────────────────────

export async function dbListOverrides(): Promise<Record<string, Partial<CaseRecord>>> {
  // Reads return empty when unauthenticated so the dual-write adapter
  // falls back to local cleanly (see `dbFirst` in `lib/repo/dual-write`).
  if (!(await requireAuth())) return {};
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
  const session = await requireAdmin();
  if (!session) return (await requireAuth()) ? FORBIDDEN : AUTH_REQUIRED;
  // Don't trust the client-supplied actor — rewrite to the session.
  const audit = session.email;
  void updatedBy; // accepted for signature parity; ignored for authz.
  try {
    const db = getDatabase();
    // Merge the inbound patch INTO the existing override row rather
    // than overwriting it. Mirrors the local backend's contract
    // (`lib/repo/local-cases.ts > setOverride`) where:
    //   - `key: value`   → set/update that key.
    //   - `key: undefined` (which serializes to JSON null when the
    //     client sends it) → remove that key from the override.
    //   - empty merged result → delete the row entirely.
    //
    // We do the merge in JS rather than SQL because the "remove
    // when null" rule is awkward in jsonb — we'd need to enumerate
    // every null-valued key to strip. Reading + computing + writing
    // is cleaner; the row volume is small (≤ catalog size).
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
      return { ok: true };
    }
    await db.sql`
      INSERT INTO case_overrides (id, patch, updated_by)
      VALUES (${id}, ${JSON.stringify(merged)}::jsonb, ${audit})
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
  const session = await requireAdmin();
  if (!session) return (await requireAuth()) ? FORBIDDEN : AUTH_REQUIRED;
  try {
    const db = getDatabase();
    await db.sql`DELETE FROM case_overrides WHERE id = ${id}`;
    return { ok: true };
  } catch (err) {
    return fail("clearOverride", err);
  }
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
  const session = await requireAdmin();
  if (!session) return (await requireAuth()) ? FORBIDDEN : AUTH_REQUIRED;
  void purgedBy; // signature parity; we use `session.email` for the audit value.
  const audit = session.email;
  try {
    const db = getDatabase();
    // Replace whatever was in the override with the tombstone. The
    // previous fields are intentionally dropped — nobody's going to
    // see this case again and we don't want them sitting around
    // taking storage.
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
      // the case never had real media uploaded), the store throws —
      // we swallow so a failed media delete doesn't roll back the
      // tombstone insert.
      try {
        await mediaStore().delete(mediaKey);
      } catch (mediaErr) {
        console.error("[db.purgeImported] media delete failed", mediaErr);
      }
    }
    return { ok: true };
  } catch (err) {
    return fail("purgeImported", err);
  }
}

/**
 * Stand-alone media delete. Used when the caller already handled
 * the metadata side-effect and just needs to clean up the file.
 */
export async function dbDeleteMedia(key: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return (await requireAuth()) ? FORBIDDEN : AUTH_REQUIRED;
  if (!key) return { ok: true };
  try {
    await mediaStore().delete(key);
    return { ok: true };
  } catch (err) {
    return fail("deleteMedia", err);
  }
}

// ─── user_cases ──────────────────────────────────────────────────
//
// Returns BOTH live and trashed in one call so the consumer can
// partition (mirrors `_cases.listUserRaw` from the localStorage
// backend, which also returns the full set). The client filters
// `deleted_at` itself when it wants live-only.

export async function dbListUserCases(): Promise<CaseRecord[]> {
  // Reads return empty when unauthenticated so the dual-write adapter
  // can fall back to local. Note: this returns ALL user cases, not
  // just the caller's — matching the existing app behavior where the
  // catalog is shared. A finer-grained read (own-only) is a future
  // refinement when the catalog grows past curated content.
  if (!(await requireAuth())) return [];
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
  void byEmail; // signature parity; we use `session.email` for the audit value.
  const audit = session.email;
  try {
    const db = getDatabase();
    await db.sql`
      UPDATE user_cases
      SET deleted_at = now(), deleted_by = ${audit}
      WHERE id = ${id}
    `;
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

// ─── custom_categories ──────────────────────────────────────────

export async function dbListCategories(): Promise<Category[]> {
  if (!(await requireAuth())) return [];
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
  const session = await requireAdmin();
  if (!session) return (await requireAuth()) ? FORBIDDEN : AUTH_REQUIRED;
  void createdBy; // signature parity; we use `session.email` for the audit value.
  const audit = session.email;
  try {
    const db = getDatabase();
    await db.sql`
      INSERT INTO custom_categories (id, label, created_by)
      VALUES (${id}, ${label}, ${audit})
      ON CONFLICT (id) DO NOTHING
    `;
    return { ok: true };
  } catch (err) {
    return fail("addCategory", err);
  }
}

export async function dbRenameCategory(id: string, label: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return (await requireAuth()) ? FORBIDDEN : AUTH_REQUIRED;
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
  const session = await requireAdmin();
  if (!session) return (await requireAuth()) ? FORBIDDEN : AUTH_REQUIRED;
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
  // Non-admins can only mutate their own favorites. Guests bucket
  // is writable by anyone authenticated (matches the legacy local
  // behavior where guests share a bucket).
  if (key !== "guest" && session.role !== "admin" && !isOwner(session, key)) return FORBIDDEN;
  try {
    const db = getDatabase();
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
  // Bulk import wipes every shared table. Admin-only.
  const session = await requireAdmin();
  if (!session) return (await requireAuth()) ? FORBIDDEN : AUTH_REQUIRED;
  void importedBy; // signature parity; we use `session.email` for the audit value.
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
