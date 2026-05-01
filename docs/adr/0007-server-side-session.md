# ADR 0007 — Server-side session for Server Actions authorization

- **Status**: Accepted (supersedes the auth surface of ADR-0001 for the DB path).
- **Date**: 2026-04-30
- **Decider(s)**: Project lead

## Context

ADR-0001 documented mock auth backed by `localStorage`: the client
keeps a `User` blob, every component reads it, and the "admin"
distinction is purely client-side. That was acceptable while
persistence was also client-side — there was nothing on the server
to authorize.

Stage 2 of the persistence migration (ADR-0006) introduced Server
Actions in `app/actions/db.ts` that mutate Postgres. Before this
ADR, every action was wide open: anyone with the auto-generated POST
endpoint of the deployed function could call `dbPurgeUserCase`,
`dbBulkImport`, or any override mutation without being logged in.
The client-side "admin" check was completely bypassable.

The audit flagged this as the blocking issue for shipping the
dual-write path to production.

## Decision

Add a real server-side session and gate every Server Action by it.
The client-side `User` blob in `localStorage` stays — it powers the
local demo path and the offline cache — but Server Actions ignore
client-supplied identity entirely.

### Token format

A signed httpOnly cookie. Body + signature joined by `.`:

```
b64url(JSON({ email, role, exp, iat })) + "." + b64url(HMAC-SHA256(body, AUTH_SECRET))
```

- HMAC-SHA256 with a single shared secret (`AUTH_SECRET` env var).
  Symmetric — no public-key crypto. Lower complexity, higher
  rotation cost; acceptable at the current scale.
- `timingSafeEqual` for the signature comparison so the trivial
  timing attack on naive `===` is closed.
- Cookie attributes: `httpOnly`, `sameSite=lax`, `secure` in
  production. `expires` mirrors the in-token `exp` so browser and
  server agree on session end.
- TTL: 8h for admin (matches local TTL), 30d for user.

### Secret resolution (dev vs prod)

In `lib/server/session.ts > getSecret()`:

1. `AUTH_SECRET` env var — only acceptable production source.
2. **Dev fallback**: if unset and `NODE_ENV !== "production"`,
   generate a per-process random buffer and log a warning. Sessions
   reset on server restart, but `npm run dev` works without
   configuring anything.
3. **Production fail-closed**: if unset in production, every
   protected action returns `auth_required`. The misconfiguration
   surfaces immediately rather than silently accepting unsigned
   cookies.

### Authorization model

In `app/actions/db.ts`:

- **Reads** (`db*List*`): require `requireAuth`. On unauthenticated
  call, return `[]` / `{}` so the dual-write `dbFirst` adapter
  falls back to local cleanly. The catalog keeps reading without a
  401 surface.
- **Admin-only writes** (overrides, categories, bulk import, blob
  deletes): require `requireAdmin`. Return `{ ok: false, reason:
"auth_required" }` or `"forbidden"` on failure.
- **Per-user writes** (`user_cases`, favorites): require
  `requireAuth` plus an ownership check via `owner_email`. A
  non-admin can only mutate rows whose `owner_email` matches their
  session.
- **Audit fields** (`updated_by`, `deleted_by`): sourced from the
  session, not the client argument. The signature still accepts the
  client value for back-compat with the local repo's call shape,
  but it's `void`'d before the SQL — clients cannot impersonate.

### `ActionResult` widening

`{ ok: true } | { ok: false; reason: "unknown" | "auth_required" |
"forbidden" }`. Existing dual-write consumers branch on `r.ok ===
false` and don't inspect the reason, so this widening is non-
breaking. The mirror failure toast in `useMirrorFailureToast` fires
on any not-ok shape, giving the user a visible signal.

## Consequences

### Pros

- **Server-enforced authorization.** The most critical class of bug
  on a write-capable API is closed.
- **Backwards compatible.** Existing callers don't change. Local
  demo path unaffected. Tests mock the Server Action module to
  bypass the cookie I/O (see `tests/setup.ts`).
- **Self-documenting failures.** The `reason` discriminator
  distinguishes "config missing" from "wrong role" from "DB error",
  which the next layer can route to different UX.

### Cons

- **Manual ops setup.** `AUTH_SECRET` has to be configured in the
  Netlify environment. We documented this in `.env.example` with the
  generation command. Without it, prod fails closed (good — but a
  forgotten setup means a broken first deploy).
- **No rotation story.** Key rotation invalidates every active
  session immediately. Acceptable at current scale (< 50 active
  sessions). For larger deployments the token would need a `kid`
  (key id) so the verifier can keep an old key alongside the new.
- **No CSRF token.** We rely on `sameSite=lax` for cross-origin
  protection. Top-level GET navigation can carry the cookie but
  Server Actions are POST and cross-origin POST is blocked by the
  cookie attribute. Sufficient for now.

## Alternatives considered

- **NextAuth / Auth.js.** Higher feature ceiling (OAuth, magic links,
  DB session adapters) but the app's identity model is trivial:
  email + role, no signups, no password resets. Adopting NextAuth
  would have meant migrating its session table alongside the
  application data. Out of scope.
- **Firebase Auth.** Already wired (ADR-0004) but the operational
  team's Firebase fluency is shallow. We have not adopted Firebase
  in production. If/when we do, this ADR is partly superseded.
- **No server-side check, hide the routes.** Rejected. The Server
  Action endpoints are auto-discoverable; obscurity is not security.

## Migration / rotation runbook

When rotating `AUTH_SECRET`:

1. Set the new value in Netlify env config. Deploy.
2. Every active session immediately fails verification → users see
   `auth_required` on the next DB write.
3. Users log in again. The new login mints a token signed with the
   new secret.

To make rotation seamless, future work: add a versioned `kid` field
to the token and let `verifySessionToken` accept N keys.
