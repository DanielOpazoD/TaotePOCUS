# ADR 0011 — Stage 4 partial: DB-authoritative writes, reads keep fallback

- **Status**: Accepted (supersedes write contract of ADR-0006).
- **Date**: 2026-05-05
- **Decider(s)**: Project lead

## Context

ADR-0006 staged a four-step migration from localStorage to Postgres
authority. Stage 3 (DB-first reads with local fallback) shipped;
writes stayed on the "local first, fire-and-forget DB mirror"
pattern. The mirror plumbing (`lib/db-mirror.ts > notifyMirrorFailure`

- `useMirrorFailureToast`) surfaced a rate-limited toast when the
  mirror call failed, asking the admin to "re-sync via Backup".

Three problems with that posture:

1. **Zombie state on every failed mirror.** A successful local write
   could persist forever in `localStorage` without ever landing in
   the DB. The user saw a green toast (local ok), then a yellow toast
   ("syncing pending"), then nothing — the mismatch was invisible
   on the next page load.
2. **The reverse-action paths in the new undo toasts (ADR-0011's
   sibling commit, "feat(toast): undo affordance") couldn't
   distinguish a failed local write from a failed DB mirror.** The
   local op always succeeded (localStorage rarely fails); the user
   thought the undo had worked.
3. **The mirror failure UI was confusing in practice.** Admins
   ignored it because it said the sync was "pending" — the failure
   mode never resolved itself without a manual Backup reupload.

Stage 4 (full) per ADR-0006 would drop the local fallback for both
reads and writes and surface every DB hiccup to the UI. That's a
real operational change: a 30 s DB outage = read-only catalog at
best, error screens at worst. The team isn't ready to commit to
that uptime.

## Decision

Ship a **partial Stage 4**:

- **Writes go DB-first.** The dual-write methods in
  `lib/repo/dual-write.ts` await the Server Action result. On
  failure they return the failure to the caller; the local cache
  is **not** touched. On success they refresh the local cache and
  return the local result.
- **Reads keep the Stage-3 contract.** `dbFirst()` is unchanged:
  try DB, on success refresh cache + return DB data; on empty or
  error fall back to the local cache. The catalog stays readable
  through transient outages.
- **The mirror toast plumbing is removed entirely.** With writes
  awaiting the DB, the zombie state can't happen; the toast that
  surfaced it has no reason to exist. `lib/db-mirror.ts`,
  `hooks/useMirrorFailureToast.ts`, and the corresponding test
  file are deleted; `App.tsx` drops the hook call.
- **`WriteResult` widens** to include `auth_required` and
  `forbidden` as failure reasons. The Server Actions in
  `app/actions/db.ts` already returned those reasons (per ADR-0007);
  the dual-write `dbThenLocal` helper now passes them through
  unchanged so the form / UI can show a precise error
  ("Sesión expirada" / "No tienes permiso").

Two intentional carve-outs:

- **Categories deliberately stay local-first.** The synchronous
  mutation API (`addCategory(label) → Category | null`,
  `renameCategory`, `removeCategory`) is consumed by ~5 call sites
  in the editor; converting to async would be a contract change for
  a low-stakes seam (categories are tiny + admin-only, drift is
  reconcilable via the existing Backup → "Subir a base de datos"
  flow). The mirror call stays, but the failure handler just
  logs — no toast.
- **Favs stay DB-first** (the toggle returns a boolean result the
  consumer already branches on, so the contract change is invisible).

## Consequences

### Pros

- **No zombie state.** A failed write can't end up in localStorage
  without being in the DB. Either both have it or neither does.
- **Honest UI.** When a write fails, the caller sees it
  immediately. The form leaves itself open with an error toast;
  the admin retries.
- **Simpler model.** ~150 LOC deleted across `db-mirror.ts` +
  `useMirrorFailureToast.ts` + the test file. The dual-write file
  drops the `mirror()` helper; the dispatch is one helper
  (`dbThenLocal`) that reads top-to-bottom.
- **Read graceful degradation preserved.** A 30 s DB hiccup means
  reads still work from cache; writes are blocked but the user
  sees a clear error rather than a silent drift.

### Cons

- **Writes are slower.** Every save / remove / setOverride etc.
  now waits for a DB roundtrip before returning. Latency was
  previously `localStorage write time` (~ms); now it's
  `localStorage + DB roundtrip` (~50–200 ms typical). Acceptable
  for an admin tool — the user gesture is "click save", not
  "type fast".
- **Categories drift is still possible.** Documented above; the
  reconciliation path (Backup) is unchanged.
- **The undo toast can fail too.** When the user clicks "Deshacer"
  and the DB rejects the inverse, the original change stays in
  place. The undo toast pattern was added in the same iteration
  as this ADR (`feat(toast): undo affordance...`); a follow-up
  commit could surface a "no se pudo deshacer" toast on inverse
  failure. Out of scope here.

## Alternatives considered

- **Full Stage 4 (drop local fallback for reads too).** Rejected
  for now. The team wants graceful read degradation for transient
  DB outages until the operational confidence is higher.
- **Keep the mirror pattern but block on it.** This is essentially
  what we did — the renaming is just to make the new contract
  explicit. The previous "mirror" name implied "best-effort, never
  blocks" which is the opposite of what now happens.
- **Leave the categories path on the new contract too.** Rejected
  on grounds of API ergonomics — making the editor's mutation
  methods async would refactor more files than the safety win
  warrants.

## Migration to full Stage 4 (when this ADR is partly superseded)

When the team is ready to drop the read fallback:

1. Replace `dbFirst()`'s catch + fallback with a re-throw, so reads
   surface the DB error to the UI.
2. Add a top-level "DB unavailable" banner / page state that the
   layout can render when reads fail.
3. Delete `localCases.list*` paths or gate them behind
   `!IS_NETLIFY_DB_ENABLED` for the dev demo.
4. Remove the categories carve-out: convert the mutations to async,
   refactor the editor's call sites.
5. Write a new ADR superseding this one.
