// Next.js App Router server-side instrumentation hook. Runs once at
// server boot. Required by @sentry/nextjs when using server / edge
// configs.
//
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Forward unhandled request errors to Sentry when available. The SDK
// version may or may not expose `captureRequestError` directly; we
// resolve it lazily so we don't fail the build if the symbol moves.
export async function onRequestError(...args: unknown[]) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    const fn = (Sentry as unknown as Record<string, unknown>).captureRequestError;
    if (typeof fn === "function") {
      await (fn as (...a: unknown[]) => unknown)(...args);
    }
  } catch {
    /* ignore */
  }
}
