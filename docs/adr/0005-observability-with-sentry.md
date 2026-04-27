# ADR 0005 — Observability with Sentry

- **Status**: Accepted.
- **Date**: 2026-04-27
- **Decider(s)**: Project lead

## Context

Up to now the app has had no error reporting in production. Route-level and global `error.tsx` boundaries exist (a uncaught render failure shows a friendly fallback instead of a white screen), and `lib/log.ts` provides a logging seam, but errors are silently swallowed in production. We don't know if a real user hit an error.

For a public educational app this is borderline acceptable; for a clinical-adjacent product where an admin uploading a case might silently fail, it is not. We need:

- Errors thrown in client components reach a dashboard.
- Failed Firestore writes (post-ADR-0004) leave a trace.
- Performance regressions on the home grid are detectable.
- Source maps map minified stacks back to readable code.

## Decision

**Sentry**, integrated via `@sentry/nextjs`. Reasoning:

- First-party SDK for Next.js 16 App Router.
- Generous free tier (10k events / month — well above what we'll generate).
- Session replay is opt-in (we keep it **off** by default — see Privacy below).
- Source map uploads automated via the Sentry CLI in production builds.
- `lib/log.ts` already abstracts the transport — Sentry drops in cleanly.

The integration is **feature-flagged on `NEXT_PUBLIC_SENTRY_DSN`**: empty DSN means the SDK initializes but never phones home, and the `withSentryConfig` wrapper in `next.config.mjs` is bypassed entirely (no source-map upload, no instrumentation injection, no bundle bloat).

## Privacy

The app is a clinical-educational platform. Even when seed data is public, we treat user-uploaded content as potentially sensitive:

- **Session replay is off** by default (`replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0`). Turning it on would record DOM and could capture case images, diagnoses, or admin-typed content. Decision belongs to the team that operates the deployment.
- **URLs are stripped of search params** in `beforeSend` so a `?caso=c001` link doesn't leak case ids into Sentry breadcrumbs.
- **PII in messages** is minimized: we never log passwords, dataURLs, or full case bodies. `lib/log.ts` calls pass `area` + ids only.
- **DSN is public** by design (it's a write-only token). API keys for the Sentry CLI (`SENTRY_AUTH_TOKEN`) are server-only and live in CI / Netlify env.

## Consequences

### Pros

- Production errors visible. Route-level boundary still catches; Sentry adds the trail.
- Performance traces (`tracesSampleRate: 0.1` in prod) detect regressions without flooding events.
- Unhandled rejections and `window.onerror` already flow through `lib/log.ts` and now reach Sentry.
- `instrumentation.ts` wires `onRequestError` for any future API routes / Server Actions.

### Cons

- ~50 KB gzip added when DSN is configured. Worth it. Stays out of the bundle when DSN is empty.
- Sentry source-map upload requires `SENTRY_AUTH_TOKEN` in CI. Without it, builds still succeed but stacks remain minified. Documented.
- Sampling decisions (10% of transactions) live in code, not Sentry's UI. Easy to revisit.

## Configuration

Three env vars total, all optional:

| Var                            | Where                     | Required                    | Notes                                                            |
| ------------------------------ | ------------------------- | --------------------------- | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN`       | client + server           | no — empty disables Sentry  | The DSN from the Sentry project settings page                    |
| `SENTRY_AUTH_TOKEN`            | CI / Netlify, server-only | only if you want sourcemaps | Generated in Sentry org settings → auth tokens                   |
| `SENTRY_ORG`, `SENTRY_PROJECT` | CI / Netlify, server-only | only with auth token        | Slugs from the Sentry project URL                                |
| `NEXT_PUBLIC_SENTRY_ENV`       | client + server           | no                          | Defaults to `production` in prod builds, `development` otherwise |
