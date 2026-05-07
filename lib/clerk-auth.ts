// Clerk-specific auth helpers. The split between this file and
// `lib/server/session.ts` mirrors the client/server divide:
//
//   - This module: pure mappers + role decision. Importable from
//     either side. No Clerk SDK side-effects.
//   - `lib/server/session.ts`: server-side session retrieval (Clerk's
//     `auth()` or the legacy HMAC cookie, depending on the flag).
//
// When `IS_CLERK_ENABLED` is false, this module is dead code — the
// hooks that consume it skip past the import. We keep the file
// loadable in either mode so unit tests don't have to mock Clerk.

import { isAdminEmail } from "./env";
import type { User } from "./types";

/**
 * Minimal shape we need from a Clerk user object. Both the client
 * (`useUser()`) and the server (`currentUser()` / `auth().sessionClaims`)
 * surface enough fields to satisfy this — we accept the lowest common
 * denominator so the same mapper works in both contexts.
 *
 * The fields are intentionally permissive (`unknown`/`null`) — Clerk's
 * own type marks several as nullable when the user hasn't completed
 * their profile.
 */
export interface ClerkUserLike {
  id: string;
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses?: ReadonlyArray<{ emailAddress: string; id: string }>;
  primaryEmailAddressId?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  publicMetadata?: Record<string, unknown> | null;
  createdAt?: number | Date | null;
}

/**
 * Resolve a Clerk user's primary email. Some Clerk responses populate
 * `primaryEmailAddress` directly; others (server-side `currentUser()`)
 * give the array + the id. Try both.
 */
export function getPrimaryEmail(u: ClerkUserLike): string | null {
  if (u.primaryEmailAddress?.emailAddress) {
    return u.primaryEmailAddress.emailAddress.toLowerCase();
  }
  if (u.emailAddresses && u.primaryEmailAddressId) {
    const match = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId);
    if (match) return match.emailAddress.toLowerCase();
  }
  // Last resort: the first address. Better than nothing for users with
  // a single-email profile, which is the common case.
  if (u.emailAddresses && u.emailAddresses.length > 0) {
    const first = u.emailAddresses[0];
    if (first) return first.emailAddress.toLowerCase();
  }
  return null;
}

/**
 * Inputs needed to decide a user's role. Pulled out as a typed bag
 * (rather than the full Clerk user) so the same decision function
 * can be called from places that only have an email + a metadata
 * blob without having to reconstruct a `ClerkUserLike`. The server
 * reads via `currentUser()`; the client reads via `useUser()`; both
 * synthesize this shape and feed it to `resolveRole`.
 */
export interface RoleInputs {
  /** Already-lowercased primary email. `null` = no email on file. */
  email: string | null;
  /** Whatever `publicMetadata.role` was — Clerk types it as `unknown`,
   *  we accept that shape so callers don't pre-validate. */
  publicMetadataRole: unknown;
}

/**
 * Single source of truth for "is this user an admin?".
 *
 * Two independent paths grant admin. Either alone is sufficient, both
 * together are fine, neither demotes the other:
 *
 *   1. `publicMetadata.role === "admin"` (case-insensitive). Set via
 *      Clerk dashboard or the Clerk admin API. Long-term source of
 *      truth — owned by whoever administers the Clerk project.
 *   2. The env-var allowlist `ADMIN_EMAILS`. Used during the bootstrap
 *      flow before anyone has had a chance to promote a user via the
 *      Clerk dashboard. Also a safety net if Clerk is misconfigured —
 *      operator can flip an env var without dashboard access.
 *
 * The function is the only place this rule is encoded. Server-side
 * (`lib/server/session.ts > getClerkSession`) and client-side
 * (`isAdminFromClerkUser`) both call this — keeping them aligned by
 * construction rather than convention. See ADR-0012.
 */
export function resolveRole(inputs: RoleInputs): "admin" | "user" {
  const { publicMetadataRole, email } = inputs;
  if (typeof publicMetadataRole === "string" && publicMetadataRole.toLowerCase() === "admin") {
    return "admin";
  }
  if (isAdminEmail(email)) return "admin";
  return "user";
}

/**
 * Adapter: decide admin-ness for a full Clerk user object. Convenience
 * wrapper around `resolveRole` — kept as the public API that existing
 * client-side callers (the React `useUser()` hook) already use.
 */
export function isAdminFromClerkUser(u: ClerkUserLike): boolean {
  return (
    resolveRole({
      email: getPrimaryEmail(u),
      publicMetadataRole: u.publicMetadata?.role,
    }) === "admin"
  );
}

/** Two-letter initials derived from name or email — same shape used
 *  across the rest of the app's avatar surfaces. */
function deriveInitials(name: string): string {
  return name
    .split(/[\s.@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => (s[0] ?? "").toUpperCase())
    .join("");
}

/**
 * Map a Clerk user to the app's `User` shape. The `User` contract was
 * defined before Clerk and is consumed by ~30 components — keeping
 * the mapping in one place avoids drift.
 *
 * - `email`: Clerk's primary email, lowercased.
 * - `name`: full name → first name → email local-part fallback.
 * - `initials`: 2-letter from name (or "AD" for admin).
 * - `role`: "admin" if metadata says so OR if email is in
 *   `ADMIN_EMAILS`; otherwise "user".
 * - `issuedAt` / `expiresAt`: synthesized from `createdAt`. Clerk
 *   manages session lifetime separately (it auto-refreshes); the
 *   numbers here exist only because the rest of the codebase reads
 *   them. We pick a far-future `expiresAt` so the
 *   `useFocusRevalidate` path in `useSession` never logs the user
 *   out — Clerk's own session is the real authority, and Clerk's
 *   `signOut` is the official log-out path.
 */
export function mapClerkUserToAppUser(u: ClerkUserLike | null | undefined): User | null {
  if (!u) return null;
  const email = getPrimaryEmail(u);
  if (!email) return null;
  const isAdmin = isAdminFromClerkUser(u);
  const fallbackName = email.split("@")[0] || email;
  const baseName = u.fullName?.trim() || u.firstName?.trim() || fallbackName;
  const displayName = isAdmin ? "Administrador" : baseName;
  const initials = isAdmin ? "AD" : deriveInitials(displayName);
  const issuedAtMs =
    u.createdAt instanceof Date
      ? u.createdAt.getTime()
      : typeof u.createdAt === "number"
        ? u.createdAt
        : Date.now();
  // Far-future expiry — Clerk owns the actual session. The legacy
  // `useFocusRevalidate` check in `useSession` compares to this and
  // logs out on expiry; we don't want it firing when Clerk's session
  // is still valid, hence ~10 years from issuedAt.
  const expiresAtMs = issuedAtMs + 10 * 365 * 24 * 60 * 60 * 1000;
  return {
    email,
    name: displayName,
    initials: initials || "U",
    role: isAdmin ? "admin" : "user",
    issuedAt: issuedAtMs,
    expiresAt: expiresAtMs,
  };
}
