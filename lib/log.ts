// Centralized logging boundary.
//
// Behavior:
//   - In dev / non-prod: console + readable tag.
//   - In prod with a Sentry DSN configured: warn/error → Sentry,
//     debug/info → swallowed.
//   - In prod with no DSN: silent.
//
// Callers never import the underlying transport — swap vendors by
// editing this one file.

import { IS_PRODUCTION, IS_SENTRY_ENABLED } from "./env";

type Level = "debug" | "info" | "warn" | "error";

interface Context {
  // Tag the source so we can grep / filter in production.
  area: string;
  // Free-form data attached to the event.
  [key: string]: unknown;
}

const isDev = !IS_PRODUCTION;
const isBrowser = typeof window !== "undefined";

// Sentry's SeverityLevel uses "warning" (not "warn"). Map our levels.
type SentryLevel = "debug" | "info" | "warning" | "error";
function toSentryLevel(level: Level): SentryLevel {
  return level === "warn" ? "warning" : level;
}

/* v8 ignore start — Sentry forwarding only runs with a configured DSN.
   Behavior is exercised manually after `npm run build` with the env set. */

// `@sentry/nextjs` exports `captureException`, `captureMessage`, and
// `addBreadcrumb` from the same module on both client and server. We
// import lazily so the bundle stays untouched when no DSN is set.
type SentryModule = typeof import("@sentry/nextjs");
let sentry: SentryModule | null = null;
let sentryLoading: Promise<SentryModule> | null = null;

function loadSentry(): Promise<SentryModule> | null {
  if (!IS_SENTRY_ENABLED) return null;
  if (sentry) return Promise.resolve(sentry);
  if (sentryLoading) return sentryLoading;
  sentryLoading = import("@sentry/nextjs").then((m) => {
    sentry = m;
    return m;
  });
  return sentryLoading;
}

function forwardToSentry(level: Level, message: string, ctx?: Context, err?: unknown) {
  if (!IS_SENTRY_ENABLED) return;
  // Fire-and-forget; we never await logs.
  loadSentry()?.then((s) => {
    try {
      const sentryLevel = toSentryLevel(level);
      // Always leave a breadcrumb regardless of level — Sentry shows
      // the trail leading up to the captured event.
      s.addBreadcrumb({
        level: sentryLevel,
        message,
        data: ctx as Record<string, unknown> | undefined,
      });
      if (level === "error" || level === "warn") {
        if (err instanceof Error) {
          s.captureException(err, {
            level: sentryLevel,
            contexts: { app: ctx as Record<string, unknown> },
          });
        } else {
          s.captureMessage(message, {
            level: sentryLevel,
            contexts: { app: ctx as Record<string, unknown> },
          });
        }
      }
    } catch {
      /* don't let logging break the app */
    }
  });
}

/* v8 ignore stop */

function emit(level: Level, message: string, ctx?: Context, err?: unknown) {
  // Always send to Sentry (decision lives there: breadcrumb vs event).
  forwardToSentry(level, message, ctx, err);

  // Console output: dev only.
  if (!isDev) return;
  const payload = ctx
    ? { ...ctx, ...(err ? { err: serialize(err) } : {}) }
    : err
      ? { err: serialize(err) }
      : undefined;
  const tag = ctx?.area ? `[${ctx.area}]` : "[log]";
  const fn = console[level] ?? console.log;
  if (payload) fn(tag, message, payload);
  else fn(tag, message);
}

function serialize(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

export const log = {
  debug: (message: string, ctx?: Context) => emit("debug", message, ctx),
  info: (message: string, ctx?: Context) => emit("info", message, ctx),
  warn: (message: string, ctx?: Context, err?: unknown) => emit("warn", message, ctx, err),
  error: (message: string, ctx?: Context, err?: unknown) => emit("error", message, ctx, err),
};

// Browser-side capture for unhandled errors. Wires automatically when
// any module that imports `log` is loaded on the client.
/* v8 ignore start — only fires on real runtime errors, not unit tests */
if (isBrowser) {
  window.addEventListener("error", (e) => {
    log.error("window.onerror", { area: "global" }, e.error || e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    log.error("unhandledrejection", { area: "global" }, e.reason);
  });
}
/* v8 ignore stop */
