# Persistence stages

Quick reference for "where does case data live, and what's authoritative
right now?". The full reasoning is in
[ADR-0003](./adr/0003-repository-facade.md),
[ADR-0006](./adr/0006-netlify-database-dual-write.md), and
[ADR-0007](./adr/0007-server-side-session.md).

## TL;DR

```
NEXT_PUBLIC_USE_DB unset / "0"  → Stage 1: localStorage primary
NEXT_PUBLIC_USE_DB=1            → Stage 4-partial (current state):
                                  • reads = DB-first with local fallback
                                  • writes = DB-authoritative; failures
                                    surface to UI; local cache only
                                    updates after DB success
Full Stage 4 (drop read fallback) → not yet shipped; see ADR-0011
                                    "Migration to full Stage 4"
```

See ADR-0006 for the original four-stage roadmap and ADR-0011 for
the current write contract.

The four Firebase env vars (`NEXT_PUBLIC_FIREBASE_*`), if all set,
override everything and switch the repo facade to the Firebase path
(`lib/firebase-*.ts`). Production does not currently set them.

## What lives where

| Data                | Local cache (browser)                           | DB (Postgres / Netlify)       | Blobs (Netlify)              |
| ------------------- | ----------------------------------------------- | ----------------------------- | ---------------------------- |
| Session cookie      | n/a (httpOnly)                                  | n/a (signed token, no DB row) | n/a                          |
| User session blob   | `localStorage[pocus_user]`                      | n/a                           | n/a                          |
| Case overrides      | `localStorage[pocus_case_overrides]`            | `case_overrides` table        | n/a                          |
| User-uploaded cases | `localStorage[pocus_user_cases]`                | `user_cases` table            | media in `pocus-media` store |
| Custom categories   | `localStorage[pocus_custom_categories]`         | `custom_categories` table     | n/a                          |
| Favorites           | `localStorage[pocus_favs:{email}]`              | `favorites` table (per email) | n/a                          |
| Imported corpus     | bundled in `lib/imported-cases.ts` (lazy chunk) | n/a (read-only seed)          | n/a                          |

## Read paths

`repo.cases.list*` and `repo.favs.list` route through the dispatcher
in `lib/repo.ts`:

- **Stage 1** (no flag): straight call into `lib/repo/local-cases.ts`,
  reading `Store.getUserCases()` etc. Synchronous-feeling.
- **Stage 4-partial** (flag on): wrapped in `dbFirst()` from
  `lib/repo/dual-write.ts`. Tries the Server Action first; on
  success, refreshes the local cache and returns the DB data; on
  empty or error, falls back to the local cache. The catalog stays
  readable through transient outages.

`repo.cases.listSeed()` always loads the imported corpus via the
dynamic `import("./imported-cases")` from `lib/seed-cases.ts`. The
6800-line dataset ships as a separate code-split chunk regardless
of stage.

## Write paths

Stage 1 — write to local. `WriteResult` returned synchronously.

Stage 4-partial (current) — DB authoritative. Implemented by
`dbThenLocal()` in `lib/repo/dual-write.ts`:

1. Run the DB Server Action.
2. On failure → return the failure (`WriteResult` shape with
   reason `auth_required` / `forbidden` / `unknown`). The local
   cache is **not** touched.
3. On success → write the local cache. Return its result.

UI consumers branch on `result.ok === false` and show a toast /
keep the form open / etc. The previous fire-and-forget mirror
pattern (and its `useMirrorFailureToast` plumbing) is gone —
zombie state in localStorage that drifts from the DB can no
longer happen.

**Carve-out**: `useCustomCategories` (the categories editor)
deliberately keeps the prior local-first pattern. The synchronous
mutation API was easier to leave alone for what's an admin-only,
reconcilable-via-Backup seam. See the comment on `mirrorDb` in
that file and ADR-0011 for the rationale.

Full Stage 4 (future) — drop the read fallback too. Reads that
fail or return empty surface to the UI as an error rather than
silently falling back to localStorage. Requires a top-level
"DB unavailable" surface in the layout. See ADR-0011's "Migration
to full Stage 4" for the checklist.

## Authorization

Every Server Action calls `requireAuth` or `requireAdmin` from
`lib/server/session.ts` before touching the DB. Cookie:

- Name: `pocus_session`
- Format: `b64url(JSON({email, role, exp, iat})).b64url(HMAC-SHA256(body, AUTH_SECRET))`
- Set on login by `app/actions/session.ts > setSessionAction`,
  cleared on logout.

If `AUTH_SECRET` is unset:

- **Dev** (`NODE_ENV !== "production"`) → transient per-process
  random secret. `npm run dev` works; sessions die on restart.
- **Prod** → fail-closed: every protected action returns
  `{ ok: false, reason: "auth_required" }`. The misconfiguration
  surfaces on the first DB write.

The audit-trail fields (`updated_by`, `deleted_by`) are sourced from
the session — clients cannot impersonate.

## Backup / restore

The "Backup" admin panel writes a versioned envelope (JSON) covering
overrides + custom categories + user-uploaded cases + favorites.
The corresponding restore path goes through
`dbBulkImport(payload, importedBy)` which wipes-and-replaces inside
a single transaction. Admin-only (Server Action requires
`requireAdmin`).

## Common operational tasks

### Seed a fresh DB from local

1. Log in as admin.
2. Backup → Descargar.
3. Backup → Subir a base de datos. (Triggers `dbBulkImport`.)

### Roll back from Stage 3 to Stage 2

Edit `lib/repo/dual-write.ts > dbFirst` and replace the body with
`return fallbackLocal()`. One-line revert; ship it; deploy.

### Rotate `AUTH_SECRET`

Set the new value in Netlify env config and redeploy. Every active
session immediately fails verification → users see `auth_required`
on the next DB write and re-log in. No graceful overlap is supported
yet — see ADR-0007 for the future versioned-key story.
