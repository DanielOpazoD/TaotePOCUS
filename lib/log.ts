// Centralized logging boundary. Today: console in dev, no-op in
// production (drop-in safe). Tomorrow: replace the body of `emit()` with
// Sentry / Datadog / Logtail without touching callers.
//
// Calls to `log.error`/`log.warn` are the seams where an observability
// vendor would attach. The shape is intentionally tiny so onboarding a
// vendor is a one-file change.

type Level = "debug" | "info" | "warn" | "error";

interface Context {
  // Tag the source so we can grep / filter in production.
  area: string;
  // Free-form data attached to the event.
  [key: string]: unknown;
}

const isDev = process.env.NODE_ENV !== "production";
const isBrowser = typeof window !== "undefined";

function emit(level: Level, message: string, ctx?: Context, err?: unknown) {
  // In development: console it for fast feedback.
  // In production: silent unless the user wires a vendor here.
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
// any module that imports `log` is loaded on the client. In production
// this is the seam where Sentry's `captureException` would land.
if (isBrowser) {
  window.addEventListener("error", (e) => {
    log.error("window.onerror", { area: "global" }, e.error || e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    log.error("unhandledrejection", { area: "global" }, e.reason);
  });
}
