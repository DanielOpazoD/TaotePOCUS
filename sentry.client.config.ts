// Sentry client-side init.
//
// When `NEXT_PUBLIC_SENTRY_DSN` is empty (the default in dev) the SDK
// initializes with no DSN and stays a no-op — no events are sent. To
// activate, drop a DSN in `.env.local` from your Sentry project.
//
// We keep this file at the repo root because @sentry/nextjs auto-
// discovers it. The browser bundle for routes ends up wrapped with
// the Sentry instrumentation only when a DSN is configured (the
// withSentryConfig wrapper in next.config.mjs is also DSN-aware).

import * as Sentry from "@sentry/nextjs";
import { IS_PRODUCTION, SENTRY_DSN, SENTRY_ENVIRONMENT } from "@/lib/env";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    // Session replay is opt-in; we keep it off by default to avoid
    // shipping clinical content (case images, diagnoses) to a third
    // party. Turn on per-team need.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // 10% of transactions in prod is plenty for a static site this
    // size. Bump if you start seeing perf issues you can't reproduce.
    tracesSampleRate: IS_PRODUCTION ? 0.1 : 1.0,
    // Don't ship dev noise.
    enabled: IS_PRODUCTION || SENTRY_ENVIRONMENT === "staging",
    // Strip URLs from breadcrumbs that could leak case ids in shared
    // links. The query strings are kept; the path is normalized in
    // beforeSend.
    beforeSend(event) {
      if (event.request?.url) {
        try {
          const u = new URL(event.request.url);
          event.request.url = u.origin + u.pathname;
        } catch {
          /* leave it */
        }
      }
      return event;
    },
  });
}
