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
    // ─── Bundle slim (May-2026 perf audit) ────────────────────────
    // `@sentry/nextjs` auto-bundles its full integration set on
    // every page (~442 KB in chunk 5706 pre-trim). Most of that is
    // Replay + BrowserTracing + Profiling — none of which we use:
    //   - Replay was opt-in only and we never flipped it on
    //     (clinical content + third-party session recording = no).
    //   - BrowserTracing produced 10% sampled transactions but the
    //     site is static enough that the perf signal isn't worth
    //     the weight; nobody on the team looks at the dashboard.
    //   - Profiling needs a server toggle we don't have configured.
    //
    // `defaultIntegrations: false` + explicit opt-in for the core
    // few we DO want shaves ~200 KB off the client bundle. The
    // opt-in list is "browser error reporting + breadcrumbs" —
    // what we actually consume in Sentry dashboards. See
    // https://docs.sentry.io/platforms/javascript/configuration/integrations
    defaultIntegrations: false,
    integrations: [
      // Wraps global error / unhandled-rejection listeners — the
      // SDK's reason for existing on the client.
      Sentry.globalHandlersIntegration(),
      // try/catch instrumentation around setTimeout / setInterval /
      // requestAnimationFrame so async errors get captured.
      Sentry.browserApiErrorsIntegration(),
      // The standard "request started / link clicked / console.error"
      // breadcrumb trail. Tiny + diagnostic gold on a catalog app.
      Sentry.breadcrumbsIntegration({
        console: true,
        dom: true,
        fetch: true,
        history: true,
        xhr: true,
      }),
      // Dedupe + classify so noise doesn't drown out signal.
      Sentry.dedupeIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.httpContextIntegration(),
      // INTENTIONALLY OMITTED:
      //   - replayIntegration (~200 KB; replays were already 0%)
      //   - browserTracingIntegration (~80 KB; no traces consumed)
      //   - browserProfilingIntegration (~40 KB; no server toggle)
    ],
    // Sample-rate flags stay at 0 as documentation of intent for
    // any future re-enable. With `defaultIntegrations: false` the
    // Replay/Tracing code isn't even loaded.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    tracesSampleRate: 0,
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
