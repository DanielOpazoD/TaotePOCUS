# Runbook: incident response

What to do when an SLO trips, a user reports an outage, or Sentry lights up.

## 0. Decide if it's an incident

Two questions:

1. **Is the user-visible behaviour wrong?** (catalog won't load, sign-in 500s, admin can't save)
2. **Is the trend escalating, not steady-state noise?**

If yes to both → it's an incident. If only the second → schedule it as a fix in the next regular PR. If only the first and it's a single-user-replicable bug → file a normal issue.

## 1. Triage (target: 5 minutes)

Run through these in order — stop as soon as you have a hypothesis.

### a. Check `/api/health?deep=1`

```sh
curl -s "https://taote-pocus.netlify.app/api/health?deep=1" | jq
```

| Result                   | Read                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| `ok: true`               | App + dependencies up. The bug is in code, not infra. → Go to `b`.     |
| `checks.db.ok: false`    | DB is down or unreachable. → [DB outage](#db-outage).                  |
| `checks.blobs.ok: false` | Blobs store is down or unbound. → [Blobs outage](#blobs-outage).       |
| 5xx / timeout            | The Function itself is failing. → [Function outage](#function-outage). |

### b. Sentry → Issues, sorted by "Last seen"

A spike in the last 15 minutes that maps to a recent deploy = regressing deploy. Go to `c`.

A burst of the same exception across many users = upstream API outage. Go to the [upstream-api](#upstream-api) section.

A long-standing issue suddenly bursting = some ambient condition flipped (DB load, CDN cache invalidation). Note + escalate.

### c. Look at the most recent deploy

```sh
gh run list --workflow=ci.yml --branch main --limit 5
```

If the regression timeline matches a recent merge, **revert first, debug after**:

```sh
gh pr view <bad-pr> --json mergeCommit
# Identify the merge commit
git revert -m 1 <merge-sha>
git push origin main
# Or: gh pr revert <bad-pr> if the option exists
```

Roll-forward (a follow-up PR with the fix) only after the revert is in production and the metric recovered.

## 2. Communicate (target: 10 minutes from triage start)

If users are affected:

1. Post a status update somewhere visible (project channel, status page, README banner — whichever exists). Format:

   > **Investigating** · `<short summary>` · `<HH:MM UTC>`. Updates every 30 minutes until resolved.

2. Update every 30 minutes even if there's no progress. Silence is worse than "still investigating".

3. When resolved:

   > **Resolved** · `<short summary>` · `<HH:MM UTC>`. Postmortem to follow.

## 3. Common scenarios

### DB outage

`checks.db.ok: false` in `/api/health?deep=1`.

- **Most likely cause**: Netlify Database (Neon) connection limit hit, or migration tracker drift after a schema change.
- **Diagnostic**: open the Netlify project → Database → Logs. Look for "too many connections" or "migration version mismatch".
- **Fix**:
  - Connection pool full → restart the Function (Netlify auto-restarts on next deploy; trigger an empty redeploy).
  - Migration drift → see `runbooks/migration-tracker-recovery.md`.
- **Mitigation while broken**: the repo facade falls back to `localCases` / `localFavs` when DB calls fail (per ADR-0006). Public reads keep working from localStorage. Admin writes will surface a toast and not persist.

### Blobs outage

`checks.blobs.ok: false`.

- **Most likely cause**: Netlify Blobs store unbound or quota hit.
- **Diagnostic**: Netlify project → Blobs → Stores. Confirm `taote-pocus-media` exists and has free space.
- **Fix**:
  - Unbound → re-deploy (the binding is auto-provisioned on first deploy).
  - Quota → upgrade the plan or purge old media.
- **User impact**: cases without media render the placeholder; existing pages stay functional.

### Function outage

`/api/health` itself 5xxs or times out.

- **Most likely cause**: Netlify Functions cold-start failure (bad import, missing env var, syntax error in a recent deploy).
- **Diagnostic**: Netlify project → Functions → Logs. Filter by `___netlify-server-handler`.
- **Fix**: revert the last deploy. If the previous deploy was healthy, this isolates the bad merge.
- **User impact**: every dynamic route returns 5xx. Static routes (`/atlas`, `/ecg` if cached) may keep serving from CDN.

### Upstream API

Burst of `failed to fetch` against an external host (Clerk, Firebase, Sentry).

- **Diagnostic**: open the upstream's status page (status.clerk.com, status.firebase.google.com, status.sentry.io).
- **Fix**: usually nothing on our side. Wait + monitor.
- **Mitigation**: feature-flag the affected surface if the outage drags. For Clerk specifically, the localStorage auth fallback covers public reads but not admin sign-in.

### Sentry events flooding

Sudden spike in event volume threatening the monthly quota.

- **Diagnostic**: Sentry → Issues, sort by frequency. Identify the top issue.
- **Fix**:
  - Add a `beforeSend` filter for the noisy event (in `sentry.client.config.ts`).
  - Or bump `tracesSampleRate` down temporarily.
- **Don't**: turn Sentry off entirely. Filter the specific event.

## 4. Postmortem template

After resolution, before anyone forgets, write a short doc. Five questions, five paragraphs:

1. **What happened?** Plain-language summary, the user-visible effect.
2. **What was the root cause?** The actual bug or misconfiguration.
3. **Why did it slip past CI?** Test we missed, lint rule we didn't have, code review angle we didn't apply.
4. **What did we do to fix it?** The specific revert / patch / config change.
5. **What changes prevent recurrence?** A test added, a rule enabled, a guardrail. ONE concrete action.

Save under `docs/postmortems/YYYY-MM-DD-slug.md`. Link from the SLO row this incident violated.

Blameless: the artifact is about systems, not people. The postmortem mentions the role ("the deploy author") not the name. Reading it should make the next person better at preventing this class of bug, not embarrassed about who shipped it.
