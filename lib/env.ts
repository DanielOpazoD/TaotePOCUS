/**
 * Typed environment access.
 *
 * All values are read once at module load. Anything starting with
 * `NEXT_PUBLIC_` is inlined into the client bundle at build time — keep
 * that in mind, never put real secrets here.
 *
 * Defaults are intentionally **safe demo values**: if you forget to set
 * an env var, the app still runs and the demo credentials are visible
 * to the user (in `AuthModal`'s `auth-hint`). For a production
 * deployment, override every `NEXT_PUBLIC_*` value via your hosting
 * provider's env config — see `.env.example` and `README.md`.
 */

function readString(name: string, fallback: string): string {
  // process.env access is statically replaced by Next at build time for
  // `NEXT_PUBLIC_*` keys. Reading via destructuring would defeat the
  // inlining, so we go through process.env explicitly.
  const value = process.env[name];
  if (typeof value === "string" && value.length > 0) return value;
  return fallback;
}

function readUrl(name: string, fallback: string): string {
  const raw = readString(name, fallback);
  // Validate at module load — fail fast if someone sets a malformed URL.
  try {
    new URL(raw);
    return raw.replace(/\/+$/, ""); // strip trailing slash for consistency
  } catch {
    if (typeof window === "undefined") {
      // Server boot: log and use fallback so the build doesn't die in CI.
      console.warn(`[env] ${name}="${raw}" is not a valid URL — using ${fallback}`);
    }
    return fallback;
  }
}

/**
 * Public site URL. Used by the sitemap, robots.txt, and OpenGraph metadata.
 * Override with `NEXT_PUBLIC_SITE_URL` in `.env.local` or your hosting env.
 */
export const SITE_URL = readUrl("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

/**
 * Demo admin credentials for the mock auth flow. **Not real auth** — see
 * ADR-0001. Configurable via `NEXT_PUBLIC_ADMIN_EMAIL` and
 * `NEXT_PUBLIC_ADMIN_PASSWORD` so demos can use deployment-specific
 * credentials without a code change. In production these are replaced
 * by a real auth provider.
 */
export const ADMIN_CREDENTIALS = {
  email: readString("NEXT_PUBLIC_ADMIN_EMAIL", "admin@taote.pocus").toLowerCase(),
  password: readString("NEXT_PUBLIC_ADMIN_PASSWORD", "admin123"),
} as const;

/** Convenience: are we running in a production build? */
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
