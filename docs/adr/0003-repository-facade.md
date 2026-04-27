# ADR 0003 — Repository facade between UI and persistence

- **Status**: Accepted.
- **Date**: 2026-04-26
- **Decider(s)**: Project lead

## Context

The application persists three things: **users** (auth + session), **cases** (admin-authored content, possibly soft-deleted), and **favorites** (per user).

Today the storage backend is `localStorage`. Tomorrow it will be Firebase (or Supabase, or a custom server — see ADR-0001 for the auth migration). We want that swap to be:

- **Mechanical, not architectural.** No file changes outside the persistence layer.
- **Testable today.** The contract should be locked in by tests before we migrate.
- **Async-ready.** `localStorage` is synchronous, every other backend is not. Pretending the API is async today means callers don't refactor when latency arrives.

## Decision

A single facade module — `lib/repo.ts` — exposes three namespaces:

- `repo.auth.{current, login, logout, msUntilExpiry}`
- `repo.cases.{listSeed, listUser, listUserRaw, listTrashed, listAll, save, remove, restore, purge}`
- `repo.favs.{list, toggle}`

Every method is `async` and returns `Promise<T>` even when the body is synchronous. Errors come back in two shapes:

- **`Result<T, E>`** for failures that are part of the contract (e.g. quota exceeded on a write). Defined in `lib/errors.ts`.
- **Typed `throw`** for failures that are exceptional (auth error, programmer error, malformed input). The `AuthError` class is exported and discriminated by `code`.

UI code calls `repo.*` and never touches `lib/store.ts` directly. The dependency graph enforces this: `components/*` does not import `lib/store`.

## Consequences

### Pros

- **Migration is a single-file PR.** Replace the bodies of `repo.auth.*`, `repo.cases.*`, `repo.favs.*` with Firestore calls. Component code untouched.
- **Tests pin the contract.** `tests/repo.test.ts` exercises the public methods with the localStorage backend. Same tests should pass after the migration — if any fail, the new backend changed the contract and we know exactly where.
- **One place for cross-cutting policy.** Session expiry, soft-delete semantics, audit-trail stamping, the public-vs-admin filter on `listAll` — all of it lives in one file, easy to audit.
- **Logging instrumentation.** Every meaningful event (login success/failure, soft-delete, restore, purge) flows through `lib/log.ts` from `repo.ts`. When a Sentry transport is added, no other code changes.

### Cons

- Slightly more indirection than calling `localStorage` directly. The facade is ~200 LOC; it pays for itself the day we migrate.
- Some operations (`save`, `remove`) need the caller to pass the current list as a parameter rather than reading internally. This is so the facade stays stateless and testable, but it's a small ceremony tax — the facade could read the current state itself, but doing so couples it to the backend's read API and makes timing assumptions.

## What is **not** in the facade

- Mock-vs-real switching. There's no environment-dependent dispatch. When we migrate we replace, we don't run two backends side by side.
- Caching, retries, or optimistic updates. The localStorage backend doesn't need them. When the network backend lands, those concerns belong in the same file (or in a thin wrapper) — not in the components.
- Validation. The `repo.cases.save` body trusts its input. Validation belongs in the form layer (and, eventually, on the server). We may add a Zod schema on `CaseRecord` inputs in the future, but it's not blocking.

## Migration checklist (when this ADR is partly superseded)

When we move part of the persistence to a network backend:

1. Add a `lib/firebase.ts` (or equivalent) that initializes the client SDK and exports a typed handle.
2. Rewrite the namespace bodies in `lib/repo.ts`. Keep the export shape identical.
3. Run `tests/repo.test.ts` — it should pass with minimal changes (the seed list will still come from `lib/data.ts`).
4. Add an integration test that hits the actual backend (separate suite, not in `npm test`).
5. Update this ADR with a "Superseded by 0004 — Firestore as primary persistence" link.
