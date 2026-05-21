# Observability — verifying Sentry is capturing

This runbook covers how to check that Sentry is actually wired in
production, what to do when the CI guard fails, and how to fire a
test event to confirm the pipeline end-to-end.

Pair with [`docs/observability.md`](../observability.md) (architecture
overview) and [`docs/adr/0005-observability-with-sentry.md`](../adr/0005-observability-with-sentry.md)
(why we chose Sentry).

---

## TL;DR for the on-call admin

1. **Is Sentry on?**
   - Open `/admin` → top of panel → AI status badge area.
   - The observability chip says either `🔴 Sentry off` or `🟢 Sentry on (prod)`.
   - Click it → modal opens with config snapshot.

2. **CI guard failed?**
   - Means `NEXT_PUBLIC_SENTRY_DSN` is empty in the build env.
   - Fix: set it in Netlify project env → Environment variables.
   - To bypass intentionally (key rotation), set `ALLOW_MISSING_SENTRY_DSN=1`.

3. **Want to verify end-to-end?**
   - In an admin console (browser DevTools, `/admin` open):
     ```js
     throw new Error("sentry-verify-" + Date.now());
     ```
   - Then go to Sentry → Issues → filter by latest. The marker
     should appear within ~30 s.

---

## What's instrumented

Three Sentry SDK init points in this repo:

| File                      | When it runs                           |
| ------------------------- | -------------------------------------- |
| `sentry.client.config.ts` | Browser bundle, every route on mount   |
| `sentry.server.config.ts` | Server actions + route handlers        |
| `sentry.edge.config.ts`   | Edge runtime (middleware, edge routes) |

All three are DSN-aware: empty `NEXT_PUBLIC_SENTRY_DSN` → SDK
initializes but never sends events. See `lib/env.ts >
IS_SENTRY_ENABLED`.

**Sample rates** (in `sentry.client.config.ts`):

- `tracesSampleRate`: 0.1 in prod, 1.0 in dev
- `replaysSessionSampleRate`: 0 (off — replays would ship clinical
  case content to a third party)
- `replaysOnErrorSampleRate`: 0 (same reason)

---

## CI guard — what it does

`scripts/sentry-prod-guard.mjs` runs at the end of the `quality`
job in CI. It checks:

1. Are we in a production-targeted build? (`NODE_ENV=production`
   OR `CI=true`).
2. If yes, is `NEXT_PUBLIC_SENTRY_DSN` non-empty?
3. If yes, is the DSN parseable as a URL?

Any failure aborts the build with a structured error message
pointing at this runbook. Local non-production runs skip the check
silently.

To intentionally allow a build through without Sentry (e.g., during
DSN rotation), set `ALLOW_MISSING_SENTRY_DSN=1` in the build env.
The script logs a loud warning but exits 0.

---

## Observability status endpoint

`GET /api/admin/observability` (admin-only) returns the live
config snapshot:

```json
{
  "sentry": {
    "enabled": true,
    "environment": "production",
    "dsnHostname": "o12345.ingest.us.sentry.io"
  },
  "build": {
    "nodeEnv": "production",
    "commitSha": "abc1234"
  }
}
```

The DSN string itself is NEVER returned — only the hostname, so
an admin who can see the response knows "Sentry is wired to
project X" without exposing the public key.

---

## End-to-end smoke test

The cheapest way to confirm captures are landing:

### 1. Trigger a marker error from the browser

Open the prod site, log in as admin, open DevTools console:

```js
throw new Error("sentry-verify-" + new Date().toISOString());
```

### 2. Verify in Sentry

Within ~30 s the error should appear at:

```
https://<your-org>.sentry.io/issues/?query=sentry-verify-
```

The timestamp marker makes it easy to find your specific event
among real errors.

### 3. Verify server-side capture

In a terminal:

```bash
curl -X POST https://<your-domain>/api/admin/observability \
  -H 'cookie: <your-admin-session>' \
  --data-raw '{"trigger": "test"}'
```

A 405 (method not allowed — the route is GET-only) is fine — the
point is the route handler runs, breadcrumbs are captured, and
any unhandled error would surface. To actually fire a server-side
error, temporarily add a `throw new Error(...)` in a route
handler, redeploy, hit the endpoint, then revert.

---

## Common failures

### "CI guard failed — NEXT_PUBLIC_SENTRY_DSN is empty"

Cause: the env var got removed from Netlify project config or
never got set there.

Fix:

1. Netlify → Project → Environment variables.
2. Add `NEXT_PUBLIC_SENTRY_DSN` with the DSN from your Sentry
   project (Sentry → Settings → Projects → <project> → Client
   Keys).
3. Re-run the failing CI job. The guard should pass.

### "Sentry says 'No DSN provided'" in browser console

Cause: the prod build embedded an empty `NEXT_PUBLIC_SENTRY_DSN`
because it wasn't set at build time. Adding it post-build doesn't
help (the value is bundled into the client JS).

Fix: trigger a new deploy with the DSN set. Netlify should pick
up the new env automatically.

### "I see events in Sentry but they're attributed to 'development' environment"

Cause: `NEXT_PUBLIC_SENTRY_ENV` isn't set in prod (defaults to
"production" only when `NODE_ENV=production`, but some deploy
preview pipelines mis-set this).

Fix: explicitly set `NEXT_PUBLIC_SENTRY_ENV=production` in the
Netlify production context (not the deploy-previews context).

---

## ADR pointers

- [`adr/0005-observability-with-sentry.md`](../adr/0005-observability-with-sentry.md) — why Sentry, what's instrumented
- [`adr/0014-defensive-storage-and-error-isolation.md`](../adr/0014-defensive-storage-and-error-isolation.md) — error-isolation seams that interact with Sentry
