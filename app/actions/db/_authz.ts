// Shared building blocks for the Server Action surface in
// `app/actions/db/*.ts`. NOT a `"use server"` file — these are
// helpers that run inside server actions, never exposed across the
// wire themselves. Keeping them here lets every action submodule
// (overrides, user-cases, favs, categories, bulk-import, migrations,
// audit) share the same authz / try-catch / audit-trail boilerplate
// without 19 hand-rolled copies.
//
// What lives here:
//
//   - `ActionResult` and its constants — the discriminated result type
//     every action returns. Mirrors `WriteResult` in `lib/store.ts`.
//   - `fail()` — server-side log + opaque "unknown" return. Never
//     leaks DB internals to the client.
//   - `recordAdminAction()` — append-only audit log writer.
//   - `loadUserCaseOwner()` + `authorizeUserCase()` — ownership check
//     for user-cases mutations.
//   - `withAdmin()` / `withAuth()` / `withDbRead()` — gate decorators
//     that wrap an action body with a uniform authz + error handler.
//
// Why a non-"use server" file: a `"use server"` directive flags every
// export as a runtime POST endpoint. Helpers, type aliases and
// constants are not endpoints — they would either be rejected by the
// directive (non-async exports) or accidentally exposed (helper
// async functions becoming public actions). Splitting them out keeps
// each side honest.

import { getDatabase } from "@netlify/database";
import { isOwner, requireAdmin, requireAuth, type SessionPayload } from "@/lib/server/session";

/**
 * Typed alias for `pg.PoolClient.query`. The pg `query` is declared as
 * a 4-way overload union whose members aren't intercompatible
 * (overload signatures: stream / queryArrayConfig / queryConfig /
 * positional), and TypeScript's strict mode can't pick one when we
 * call it inline. We cast through this single shape so the rest of
 * the file stays readable. Runtime is unchanged.
 */
export type DbQuery = (config: { text: string; values?: unknown[] }) => Promise<unknown>;

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
 */
export type ActionResult =
  | { ok: true }
  | { ok: false; reason: "unknown" | "auth_required" | "forbidden" };

// Narrow types on the failure constants — the discriminator stays
// fixed so callers (and the gate decorators below) can use them in
// positions that demand a specific failure shape, not the wider
// ActionResult union (which would otherwise let TS think the value
// might still be `{ ok: true }`).
export const AUTH_REQUIRED = {
  ok: false,
  reason: "auth_required",
} as const satisfies { ok: false; reason: "auth_required" };

export const FORBIDDEN = {
  ok: false,
  reason: "forbidden",
} as const satisfies { ok: false; reason: "forbidden" };

/**
 * Server-side log + opaque failure response. Functions log to Netlify
 * automatically (stdout/stderr capture). We deliberately don't include
 * the SQL string or the error message in the returned shape — those
 * are debugging artefacts and shouldn't round-trip to the client.
 *
 * Returns the narrow failure shape (not the wider ActionResult union)
 * so callers / decorators that compose this in a non-`{ok:true}`
 * position satisfy TypeScript without re-narrowing.
 */
export function fail(area: string, err: unknown): { ok: false; reason: "unknown" } {
  console.error(`[db.${area}]`, err);
  return { ok: false, reason: "unknown" };
}

// ─── audit log ──────────────────────────────────────────────────

/**
 * Append-only admin audit log kinds. Constrained at the application
 * layer (this union) so the column stays grep-friendly without a SQL
 * enum. Adding a new kind = one literal here, no schema change.
 *
 * Schema: see `netlify/database/migrations/0003_admin_actions.sql`.
 */
export type AdminActionKind =
  | "override_set"
  | "override_cleared"
  | "category_added"
  | "category_renamed"
  | "category_removed"
  | "user_case_saved"
  | "user_case_soft_deleted"
  | "user_case_restored"
  | "import_purged"
  | "bulk_imported";

/**
 * Append a row to `admin_actions`. Best-effort: a failure to insert
 * the audit row never aborts the parent action — we'd rather lose
 * the audit trail for one event than fail an admin's edit because
 * the audit table is misconfigured. Errors are logged server-side
 * (via `fail`) so the operator can investigate.
 */
export async function recordAdminAction(
  kind: AdminActionKind,
  actorEmail: string,
  targetId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const db = getDatabase();
    await db.sql`
      INSERT INTO admin_actions (kind, target_id, actor_email, payload)
      VALUES (${kind}, ${targetId}, ${actorEmail}, ${JSON.stringify(payload)}::jsonb)
    `;
  } catch (err) {
    fail(`recordAdminAction:${kind}`, err);
  }
}

// ─── user-case ownership ────────────────────────────────────────

/**
 * Confirm the row at `id` in `user_cases` belongs to `session.email`.
 * Returns the resolved owner_email so callers can pass it as the
 * audit field without re-querying. `null` means "row doesn't exist
 * or doesn't belong to caller" — treat as forbidden.
 */
async function loadUserCaseOwner(id: string): Promise<string | null> {
  const db = getDatabase();
  const rows = await db.sql<{ owner_email: string | null }>`
    SELECT owner_email FROM user_cases WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rows[0]?.owner_email ?? null;
}

/**
 * Admins always pass the check. Non-admins must own the row.
 * Returns the row's owner_email on success so the audit trail can
 * carry it without an extra query.
 */
export async function authorizeUserCase(
  session: SessionPayload,
  id: string,
): Promise<{ ok: true; ownerEmail: string | null } | { ok: false; reason: "forbidden" }> {
  if (session.role === "admin") {
    return { ok: true, ownerEmail: await loadUserCaseOwner(id) };
  }
  const owner = await loadUserCaseOwner(id);
  if (owner === null) {
    // Either the row doesn't exist (treat as forbidden — don't leak
    // existence) or it has no owner (orphan — only admins touch those).
    return { ok: false, reason: "forbidden" };
  }
  if (!isOwner(session, owner)) return { ok: false, reason: "forbidden" };
  return { ok: true, ownerEmail: owner };
}

// ─── gate decorators ─────────────────────────────────────────────

/**
 * Run `fn` only if the caller is admin. Wraps the body with the
 * unified try/fail handler so each action's body stays focused on
 * its DB work.
 *
 * `fn` returns the success shape (typically `{ ok: true; ... }` or a
 * richer payload like `MigrationsHealth`). The wrapper widens the
 * return type with the standard failure branches.
 */
export async function withAdmin<T>(
  area: string,
  fn: (session: SessionPayload) => Promise<T>,
): Promise<T | { ok: false; reason: "auth_required" | "forbidden" | "unknown" }> {
  const session = await requireAdmin();
  if (!session) return (await requireAuth()) ? FORBIDDEN : AUTH_REQUIRED;
  try {
    return await fn(session);
  } catch (err) {
    return fail(area, err);
  }
}

/**
 * Run `fn` only if the caller is authenticated (any role). Same
 * shape as `withAdmin` — used for per-user surfaces (favorites,
 * user-case mutations) where ownership is the next gate inside the
 * body.
 */
export async function withAuth<T>(
  area: string,
  fn: (session: SessionPayload) => Promise<T>,
): Promise<T | { ok: false; reason: "auth_required" | "unknown" }> {
  const session = await requireAuth();
  if (!session) return AUTH_REQUIRED;
  try {
    return await fn(session);
  } catch (err) {
    return fail(area, err);
  }
}

/**
 * Public-read decorator. The catalog reads (`dbListOverrides`,
 * `dbListUserCases`, `dbListCategories`) are open to anonymous
 * visitors — gating them on auth made incognito users see a
 * stripped-down version of the site (raw seed corpus without the
 * admin's edits). On error, returns `fallback` so the UI keeps
 * rendering rather than crashing the page.
 */
export async function withDbRead<T>(area: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    fail(area, err);
    return fallback;
  }
}
