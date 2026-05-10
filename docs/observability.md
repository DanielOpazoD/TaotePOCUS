# Observability

How to know if Taote POCUS is broken before users do.

## At-a-glance dashboards

| Tool                                         | What it shows                                      | Cadence                      |
| -------------------------------------------- | -------------------------------------------------- | ---------------------------- |
| **Sentry** ([dashboard][sentry])             | Errors, performance traces, slow transactions      | Realtime                     |
| **Netlify Analytics** ([dashboard][netlify]) | Request volume, status codes, function invocations | 1-min lag                    |
| **`/api/health`**                            | Liveness + dependency probe                        | On-demand / external monitor |
| **Lighthouse CI** (per push to main)         | Perf, a11y, best-practices, SEO scores             | Per-deploy                   |

## SLOs (current, aspirational)

These are the targets we hold ourselves to. They are reviewed quarterly and tightened as the user base grows. Treat them as floors — visible regression below the threshold is an incident, not a maintenance task.

| Metric                           | Target           | How it's measured                                                     |
| -------------------------------- | ---------------- | --------------------------------------------------------------------- |
| **Catalog page availability**    | 99.5% / month    | `/api/health` 200s vs total. External uptime monitor (1-min cadence). |
| **Sign-in success rate**         | 95%              | Clerk dashboard → conversion.                                         |
| **Server Action success rate**   | 99%              | `app/actions/db/*` — Sentry transaction outcome.                      |
| **First Contentful Paint (p95)** | < 2.5s           | Lighthouse CI `first-contentful-paint`.                               |
| **Cumulative Layout Shift**      | < 0.1            | Lighthouse CI `cumulative-layout-shift`.                              |
| **Sentry error rate**            | < 1% of sessions | Sentry "% sessions with errors".                                      |

When an SLO trips, an incident starts — see `runbooks/incident-response.md`.

## Health endpoint

`GET /api/health` — public, no auth.

### Liveness (default)

```sh
curl -s https://taote-pocus.netlify.app/api/health | jq
```

Returns 200 with build metadata. Does NOT touch dependencies. Cheap; safe to hit at high frequency. Used by external uptime monitors.

```json
{
  "ok": true,
  "build": { "commit": "abc123", "deployedAt": "2026-05-10T..." },
  "checks": { "db": { "ok": true }, "blobs": { "ok": true } },
  "ts": "2026-05-10T03:10:00Z"
}
```

### Readiness (deep)

```sh
curl -s "https://taote-pocus.netlify.app/api/health?deep=1" | jq
```

Pings every dependency: `SELECT 1` against the DB, store binding check for Blobs. Slow (~50-200ms). Returns 503 on any failure with the failing field populated. Use during incident triage or as a deploy gate.

## What to look at when something breaks

In rough order from "1-minute glance" to "deep dive":

1. **Open `/api/health?deep=1`** — fastest signal. If it 503s, you know which dependency is out.
2. **Sentry → Issues** — group by frequency. New issues at the top of the list usually correlate with the regressing deploy.
3. **Sentry → Performance → Slow Transactions** — for a "the page feels slow" report. Look at the p95 column for the affected route.
4. **Netlify → Functions logs** — for any 500 the user reports. Filter by status code + time window.
5. **GitHub Actions → Lighthouse CI** — for a regression report on perf / a11y / best-practices score.

## Source map upload chain

Sentry minified stacks become readable when source maps are uploaded at deploy time:

1. `next.config.mjs` wraps the build with `withSentryConfig`.
2. The Sentry CLI (in the build env, gated on `SENTRY_AUTH_TOKEN`) uploads the maps to the Sentry org.
3. Sentry's UI joins the minified stack with the maps on display.

**If stacks come back minified in Sentry**, check (in this order):

- `SENTRY_AUTH_TOKEN` set in Netlify build env (Site settings → Environment).
- `SENTRY_ORG` and `SENTRY_PROJECT` match the Sentry project's slugs.
- Build log contains `Source Maps uploaded successfully` (Sentry CLI output).
- The deployed bundle's `version` matches what's in Sentry (if you bump the release name, the maps are scoped to the new release).

## Privacy

- **Session replay is OFF by default.** See ADR-0005 for the reasoning.
- **URLs are stripped of search params** before hitting Sentry's `beforeSend` so case ids (`?caso=tw-1234`) don't leak.
- **PII never logged.** `lib/log.ts` calls only carry `area` + sanitized ids.
- **Health endpoint is public** but exposes only build commit + dependency-up booleans + latencies — no env vars, no user data, no case data.

## Adding a new SLO

1. Define the metric (what's measured, where) and the target (number, percentile, window).
2. Pick a probe — Sentry transaction, Lighthouse audit, or `/api/health`.
3. Add a row to the table above.
4. Update `runbooks/incident-response.md` with the runbook path for the new SLO.

## Adding a new health check

1. Implement the probe in `app/api/health/route.ts` under `checks`.
2. Bump the response shape with the new key. The shape is documented as stable; treat additions as additive (don't rename existing keys).
3. Update the runbook section in this doc.

[sentry]: https://sentry.io/organizations/<org>/projects/<project>/
[netlify]: https://app.netlify.com/projects/taotepocus/analytics
