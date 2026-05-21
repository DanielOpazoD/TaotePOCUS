#!/usr/bin/env node
// Production build guard: fail the build if Sentry is not configured
// in a production environment. Run as the LAST step of the CI quality
// job, after typecheck + tests + bundle budget.
//
// Why: the existing setup makes Sentry opt-in via
// `NEXT_PUBLIC_SENTRY_DSN`. If the DSN drifts off the Netlify env
// (rotated key, accidentally removed, never set), Sentry initializes
// as a no-op and the app silently captures zero errors. The user has
// no signal until an outage they don't know about.
//
// This guard makes that drift loud:
//
//   - On a production CI run (`NODE_ENV=production` OR `CI=true`),
//     `NEXT_PUBLIC_SENTRY_DSN` must be non-empty. Empty → exit 1.
//   - On every other run (local dev, e2e harness that unsets it
//     deliberately), the guard skips. Local builds stay friction-free.
//
// To opt out of the guard for a specific intentional production build
// (e.g. a temporary deploy without Sentry while keys rotate), set
// `ALLOW_MISSING_SENTRY_DSN=1`. The script logs a loud warning but
// allows the build through. Don't ship that flag silently.
//
// Usage in CI:
//   node scripts/sentry-prod-guard.mjs

const isProdBuild = process.env.NODE_ENV === "production" || process.env.CI === "true";
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const opt_out = process.env.ALLOW_MISSING_SENTRY_DSN === "1";

if (!isProdBuild) {
  console.log("[sentry-guard] non-production build, skipping check");
  process.exit(0);
}

if (dsn && dsn.length > 0) {
  // Don't log the DSN itself — even prefixes can leak the org/project.
  // Just confirm presence + the hostname.
  try {
    const host = new URL(dsn).host;
    console.log(`[sentry-guard] OK — NEXT_PUBLIC_SENTRY_DSN is set (host: ${host})`);
  } catch {
    console.error(`[sentry-guard] FAIL — NEXT_PUBLIC_SENTRY_DSN is set but unparseable as a URL.`);
    console.error(
      `[sentry-guard]   The Sentry SDK won't initialize correctly. Check the value in your env config.`,
    );
    process.exit(1);
  }
  process.exit(0);
}

if (opt_out) {
  console.warn("\n[sentry-guard] ⚠️  WARNING: production build without NEXT_PUBLIC_SENTRY_DSN.");
  console.warn("[sentry-guard]    Errors will NOT be captured. ALLOW_MISSING_SENTRY_DSN=1 is set,");
  console.warn("[sentry-guard]    so the build proceeds. Restore the DSN ASAP.\n");
  process.exit(0);
}

console.error("\n[sentry-guard] FAIL — production build without NEXT_PUBLIC_SENTRY_DSN.\n");
console.error("[sentry-guard] Sentry will initialize as a no-op and the app will silently");
console.error("[sentry-guard] capture zero errors. To fix:");
console.error("");
console.error("[sentry-guard]   1. Confirm NEXT_PUBLIC_SENTRY_DSN is set in your hosting");
console.error("[sentry-guard]      env (Netlify: Project configuration → Environment");
console.error("[sentry-guard]      variables).");
console.error("");
console.error("[sentry-guard]   2. To bypass intentionally (rotating keys, etc.), set");
console.error("[sentry-guard]      ALLOW_MISSING_SENTRY_DSN=1 — this logs a warning but");
console.error("[sentry-guard]      lets the build through.");
console.error("");
console.error("[sentry-guard]   3. See docs/runbooks/observability.md for the full");
console.error("[sentry-guard]      Sentry verification flow.");
console.error("");
process.exit(1);
