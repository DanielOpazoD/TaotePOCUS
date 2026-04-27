# ADR 0001 — Mock authentication backed by `localStorage`

- **Status**: Accepted (transitional). To be superseded by a real auth provider before any production handling of identifiable data.
- **Date**: 2026-04-26
- **Decider(s)**: Project lead

## Context

The project is at the prototype stage. The team needs to:

1. Demo the full admin flow (create / edit / soft-delete cases, restore, purge) end-to-end without standing up a backend.
2. Iterate on UX with real interactions, not stubs.
3. Keep the door open for a clean migration to Firebase / Auth.js / a custom server.

A real auth provider would require:

- A backend or a managed identity service (Firebase Auth, Auth0, Clerk, Supabase).
- Email verification and password reset flows.
- Server-issued, signed session tokens.
- A revocation list.

That work is not justified yet — we don't have hosting, we don't have real users, the content seed is hand-curated, and there's no PHI in the system.

## Decision

We implement a **mock authentication layer** with these properties:

1. The "admin" role is gated by **hardcoded credentials** (configurable via `NEXT_PUBLIC_ADMIN_EMAIL` / `NEXT_PUBLIC_ADMIN_PASSWORD`).
2. Sessions are persisted as JSON in `localStorage["pocus_user"]`.
3. Sessions carry `issuedAt` and `expiresAt`. Reads validate the structure and reject expired sessions, auto-clearing them.
4. Admin sessions expire faster (8 h) than user sessions (30 d) — smaller blast radius for forgotten devices.
5. All auth code lives behind a single facade (`lib/repo.ts → auth`). Migration is a body-rewrite, not a caller refactor.

## Consequences

### Pros

- Zero hosting cost. The whole prototype lives on Netlify static.
- Fast iteration. New features ship without backend round-trips.
- Migration path is mechanical: rewrite `lib/repo.ts` `auth.*` against a real provider; component code untouched.

### Cons / Risks

- **Trivially bypassable**: a user opening DevTools can write `localStorage["pocus_user"] = '{"role":"admin", …}'` and access the admin panel. Nothing on the client can prevent this.
- **No multi-device sync**. Logging in on phone A doesn't show favorites added on laptop B.
- **No password reset, email verification, MFA**.
- **Credentials in the bundle**. Anything starting with `NEXT_PUBLIC_` is shipped to the browser. The "demo admin" password is intentionally public — calling it out in `.env.example` and the README so nobody mistakes it for real.

### Risk treatments while still on this decision

- The admin panel UI does not enable any action that mutates anything outside the local browser. Even a forged admin role can't break shared state because there is no shared state.
- The `Demo admin: admin@taote.pocus / admin123` hint in the auth modal makes the limitation explicit. Any user who reads it knows the security model.
- The `User` type carries `expiresAt` so we have a place to enforce automatic logout the moment the seed is replaced by a real backend.

## Migration plan (this ADR is superseded)

When we move to real auth:

1. Pick a provider (Firebase Auth is leading because the rest of the data layer is also moving to Firestore — see ADR-0003).
2. Add a `lib/firebase.ts` that owns the client SDK init.
3. Rewrite `lib/repo.ts` `auth.login` / `logout` / `current` to call the provider.
4. Drop `ADMIN_CREDS` and the `auth-hint` block in `AuthModal.tsx`. Admin role becomes a custom claim on the auth token.
5. Update tests in `tests/repo.test.ts` — the contract should not change, only the implementation.
6. Update `README.md` and supersede this ADR.

Estimated effort: 1 working day for the auth layer, minus whatever Firebase setup time the team already absorbed.
