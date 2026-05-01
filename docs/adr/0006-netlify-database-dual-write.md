# ADR 0006 — Netlify Database dual-write with staged migration

- **Status**: Accepted (extends ADR-0003).
- **Date**: 2026-04-28
- **Decider(s)**: Project lead

## Context

ADR-0003 introduced the repo facade and ADR-0004 named Firebase as the
intended primary persistence. Between then and now we provisioned a
Netlify Database (Postgres via Neon) for the live deployment because:

- **Auth posture**: Server-side enforcement is a hard requirement before
  the catalog goes public (admin can purge cases). Firestore Rules can
  do this but the team has more SQL operational fluency.
- **Bulk import**: The `scripts/apply-twitter-import.mjs` flow drops 326
  rows in one go. A transactional `BEGIN ... COMMIT` is far less risky
  than 326 round-trips to Firestore.
- **Backups**: Postgres backups are the operations team's existing
  muscle memory.

We can't ship the swap as a big-bang because the dev demo path runs on
`localStorage` and the unit tests exercise it. Need a graceful staged
migration so each stage is independently shippable and reversible.

## Decision

Four stages. The flag `NEXT_PUBLIC_USE_DB=1` controls progression
(`lib/env.ts > IS_NETLIFY_DB_ENABLED`). Each stage is a code change
plus a documented behavior contract:

1. **localStorage primary** (pre-flag, flag off).
   The repo facade dispatches to `localCases` / `localFavs`. No DB
   round-trips. This is the dev-demo and unit-test path; it stays
   working forever.

2. **Dual-write** (flag on, reads still local).
   Every successful local mutation fires a fire-and-forget mirror to
   the Server Actions in `app/actions/db.ts`. Reads stay local. A
   failed mirror surfaces a toast via `lib/db-mirror > notifyMirrorFailure`
   so the admin notices drift, but doesn't block the local op. The
   `dualWriteCases` / `dualWriteFavs` adapters in
   `lib/repo/dual-write.ts` compose this on top of the local backends.

3. **DB-first reads, local fallback** (current state).
   Reads now hit `dbList*` first; on success they refresh the local
   cache so the next reload doesn't roundtrip; on empty or error they
   fall back to local. Implemented as a single `dbFirst` helper in
   `lib/repo/dual-write.ts`. Stage 3 means the DB has become the
   _authoritative_ source — local is now a cache.

4. **DB as source of truth** (future, flag still on).
   Drop the local fallback and the dual-write semantics. Every read
   goes to the DB; every write goes to the DB and surfaces failures
   to the UI synchronously. The repo facade collapses to a single
   path. localStorage becomes purely an offline cache (and may be
   removed entirely if PWA scope shrinks).

The `IS_FIREBASE_ENABLED` path from ADR-0004 still exists in the
dispatch (`lib/repo.ts`), but is not wired in production. It's a
parallel option that takes precedence if all six Firebase env vars
are set; the practical default for the live deploy is Netlify DB.

## Consequences

### Pros

- **No big-bang.** Every stage is shippable; rollback is "flip the
  flag" until Stage 4 lands.
- **Tests stay valid.** The `localCases` / `localFavs` backends are
  unchanged and remain the primary path for `npm test`. Mock the
  DB action module per-suite (already done in
  `tests/BackupPanel.test.tsx`, etc.) when a test needs to exercise
  the dual-write seam.
- **Bisectable failure.** If a Stage 3 read pattern misbehaves,
  flipping back to Stage 2 is a one-line revert in `dbFirst`.

### Cons

- **Three persistence backends in the codebase** (local, dual-write,
  Firebase). Real cognitive cost. Mitigation: the dual-write file is
  ~230 LOC and clearly bounded; Firebase is mostly stub backends.
  Once Stage 4 lands and Firebase is verified abandoned, we delete
  ~400 LOC.
- **Session boundary mismatch.** The local backend doesn't know
  about the cookie-based session that the DB requires; we synced
  this with the auth wiring in `localAuth.login` / `.logout` —
  see ADR-0007.

## What is currently shipping

Stage 3 (DB-first reads, local fallback). Stage 4 is open work.

## Migration to Stage 4 (when this ADR is partly superseded)

1. Backfill: ensure every legacy override / user-case in the DB has
   a `description` (see ADR-0008). Run a one-shot SQL script.
2. Drop the `fallbackLocal` branch in `dbFirst`. Reads that fail or
   return empty should surface, not silently fall back.
3. Promote write failures from "log + toast" to "throw". Update the
   form's error path so the user sees the failure synchronously.
4. Delete `localCases.list*` paths if the local backend remains
   only for dev demos; or keep them gated by `!IS_NETLIFY_DB_ENABLED`.
5. Write a new ADR superseding this one.
