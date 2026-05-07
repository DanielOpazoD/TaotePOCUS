# ADR 0012 — Unified role resolution: `resolveRole()` is the single source of truth

- **Status**: Accepted.
- **Date**: 2026-05-06
- **Decider(s)**: Project lead.
- **Relates to**: ADR-0001 (mock auth), ADR-0007 (server-side session).

## Context

The app has two server-side auth backends, both currently active in
production code based on `IS_CLERK_ENABLED`:

1. **Clerk** (`@clerk/nextjs`) — production deploys with the Netlify
   Clerk extension. Reads `currentUser()` server-side and exposes
   `auth()` / `useUser()` client-side.
2. **Legacy HMAC cookie** (`lib/server/session.ts > verifySessionToken`)
   — the dev / CI / no-Clerk fallback. Cookie body is a base64url JSON
   payload `{email, role, exp, iat}` with an HMAC-SHA256 signature.

Both backends expose the same `requireAuth` / `requireAdmin` /
`isOwner` surface to Server Actions in `app/actions/db.ts`. The
Server Actions don't know which backend answered.

The audit (Block M) flagged a real drift risk: the **rule for
"is this user an admin?"** was reimplemented inline in two places:

```ts
// lib/clerk-auth.ts — client-side path
export function isAdminFromClerkUser(u: ClerkUserLike): boolean {
  const role = u.publicMetadata?.role;
  if (typeof role === "string" && role.toLowerCase() === "admin") return true;
  return isAdminEmail(getPrimaryEmail(u));
}

// lib/server/session.ts — server-side path
const metaRole = (u.publicMetadata as { role?: unknown } | null | undefined)
  ?.role;
const isAdmin =
  (typeof metaRole === "string" && metaRole.toLowerCase() === "admin") ||
  isAdminEmail(email);
```

Same rule, two implementations. Neither imports the other. A bug
fix or rule change in one would silently leave the other behind.
That's the kind of code that produces a subtle privilege drift no
one notices until the wrong user is admin in one view and not the
other.

## Decision

**Extract a single `resolveRole({ email, publicMetadataRole })`
function in `lib/clerk-auth.ts`. Both the server-side
`getClerkSession()` and the client-side `isAdminFromClerkUser()`
now route through it.**

The rule is encoded once and tested in one place
(`tests/clerk-auth-resolve-role.test.ts`):

```ts
export function resolveRole(inputs: RoleInputs): "admin" | "user" {
  const { publicMetadataRole, email } = inputs;
  if (
    typeof publicMetadataRole === "string" &&
    publicMetadataRole.toLowerCase() === "admin"
  ) {
    return "admin";
  }
  if (isAdminEmail(email)) return "admin";
  return "user";
}
```

### Rule semantics (locked by test)

Two **independent** paths grant admin. Either alone is sufficient,
both together are fine, neither demotes the other:

1. **`publicMetadata.role === "admin"`** (case-insensitive). Set via
   the Clerk dashboard or the Clerk admin API. This is the long-term
   source of truth — owned by whoever administers the Clerk project.
2. **`ADMIN_EMAILS` env var** allowlist. Used during the bootstrap
   flow before anyone has had a chance to promote a user via the
   Clerk dashboard. Also a safety net if Clerk is misconfigured: an
   operator can flip an env var without dashboard access.

### What is explicitly NOT decided here

- **The legacy HMAC cookie backend is NOT deprecated.** It remains
  the active path in dev / CI / no-Clerk deploys. Removing it is a
  separate decision that requires committing to a single auth
  vendor in production — see "Future work" below.
- **The role decision in the legacy cookie backend** doesn't go
  through `resolveRole`. Cookie-backed sessions carry `role` in the
  signed payload itself (decided at login time, in
  `app/actions/session.ts`). Role drift can't happen there because
  there's only one place that mints the cookie.

## Consequences

### Positive

- **Single test surface** for the rule. 24 tests in
  `tests/clerk-auth-resolve-role.test.ts` pin every branch
  (lowercase / uppercase / mixed-case role, missing / null /
  non-string role, allowlist hit / miss, both paths together,
  missing email).
- **No more drift between the server and client Clerk paths** —
  they're aligned by construction, not by convention.
- **Documented invariant** that future contributors can lean on:
  the audit log can correctly attribute admin actions because the
  role decision is deterministic.

### Negative / accepted trade-offs

- The legacy cookie backend keeps a parallel role pathway. We
  accept this because:
  - The cookie payload is signed at login time and never re-evaluated.
  - The login flow lives in one file (`app/actions/session.ts`) so
    drift inside that backend isn't a concern.
  - Unifying it would require changing the cookie schema or doing a
    two-stage migration — out of scope for this ADR.

### Future work

- **Pick one backend in production** (likely Clerk) and deprecate
  the cookie path with a release window. ADR-0013 candidate. Until
  then, this ADR pins the rule for the Clerk path; the cookie path
  is internally consistent on its own.
- If `ADMIN_EMAILS` allowlist is removed in favor of metadata-only,
  the change is a one-line edit to `resolveRole` and the test
  suite catches every dependent assertion.

## Verification

Run `npm run test:coverage` — `lib/clerk-auth.ts` is fully
covered. Both consumer modules
(`lib/server/session.ts > getClerkSession`,
`lib/clerk-auth.ts > isAdminFromClerkUser`) are exercised
end-to-end against `resolveRole` in their own suites.
