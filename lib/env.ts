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
    /* v8 ignore start — only triggered by a misconfigured deployment */
    if (typeof window === "undefined") {
      // Server boot: log and use fallback so the build doesn't die in CI.
      console.warn(`[env] ${name}="${raw}" is not a valid URL — using ${fallback}`);
    }
    return fallback;
    /* v8 ignore stop */
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

/**
 * Dev-time admin auto-login. When `NEXT_PUBLIC_ADMIN_BYPASS=1` is set
 * in `.env.local` (or any non-production env), the app starts with
 * an admin session pre-mounted — no login modal, no credentials. Use
 * to skip the auth dance while editing the catalog locally.
 *
 * Hard-disabled in production builds even if the env var is set, so a
 * leaked `.env` can't accidentally open admin to the public.
 */
// Direct dot-access (see note on IS_NETLIFY_DB_ENABLED below). Bracket-
// access via readString isn't statically replaced by Turbopack, so the
// flag would silently resolve to false in client bundles.
export const IS_ADMIN_BYPASS_ENABLED =
  !IS_PRODUCTION && process.env.NEXT_PUBLIC_ADMIN_BYPASS === "1";

// ─────────────────────────────────────────────────────────────────────────────
// Netlify Database
// ─────────────────────────────────────────────────────────────────────────────
//
// Postgres database provisioned via Netlify (Neon under the hood). Wiring
// strategy is documented in `app/actions/db.ts` and `lib/repo.ts`:
//
//   1. localStorage stays the source of truth.
//   2. Setting NEXT_PUBLIC_USE_DB=1 turns on dual-write — every mutation
//      that hits localStorage also fires off a best-effort mirror to the
//      DB via the Server Actions in `app/actions/db.ts`. Reads stay local.
//   3. A future flip changes reads to "DB first, local fallback".
//   4. Eventually localStorage demotes to an offline cache.
//
// Hard-disabled when running outside the browser (the actions need to
// be invoked from a request context). Setting the flag without a
// linked Netlify site does no harm — the action calls just fail and
// the UI keeps working off localStorage.

// Direct dot-access so Turbopack/Next can statically replace this at
// build time. `readString(name, …)` uses bracket-access (`process.env[name]`)
// which the bundler can't follow — the value would be `undefined` at
// runtime in the client. Keep this pattern for any `NEXT_PUBLIC_*` flag
// that gates JSX visibility.
export const IS_NETLIFY_DB_ENABLED = process.env.NEXT_PUBLIC_USE_DB === "1";

// ─────────────────────────────────────────────────────────────────────────────
// Firebase
// ─────────────────────────────────────────────────────────────────────────────
//
// All `NEXT_PUBLIC_FIREBASE_*` values are safe to ship to the client — by
// design Firebase API keys are not secrets, only Firestore Security Rules
// are. Setting them up flips `IS_FIREBASE_ENABLED` to true and the repo
// facade switches to the network backend automatically.
//
// If any required field is missing, the app falls back to localStorage so
// dev / demo work without an account. See `lib/firebase.ts` and ADR-0004.

const firebaseRaw = {
  apiKey: readString("NEXT_PUBLIC_FIREBASE_API_KEY", ""),
  authDomain: readString("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", ""),
  projectId: readString("NEXT_PUBLIC_FIREBASE_PROJECT_ID", ""),
  storageBucket: readString("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", ""),
  messagingSenderId: readString("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", ""),
  appId: readString("NEXT_PUBLIC_FIREBASE_APP_ID", ""),
};

/** True when every required Firebase field is configured. */
export const IS_FIREBASE_ENABLED =
  firebaseRaw.apiKey !== "" &&
  firebaseRaw.authDomain !== "" &&
  firebaseRaw.projectId !== "" &&
  firebaseRaw.appId !== "";

/**
 * Firebase Web SDK config, ready to pass to `initializeApp`. Always
 * exported (never `null`) so consumers can pass it; check
 * `IS_FIREBASE_ENABLED` first to decide whether to initialize.
 */
export const FIREBASE_CONFIG = firebaseRaw;

// ─────────────────────────────────────────────────────────────────────────────
// Sentry
// ─────────────────────────────────────────────────────────────────────────────
//
// Optional. When `NEXT_PUBLIC_SENTRY_DSN` is set, errors and unhandled
// rejections are forwarded via `lib/log.ts` and the SDK auto-instruments
// route changes. Empty DSN → SDK is a no-op.

export const SENTRY_DSN = readString("NEXT_PUBLIC_SENTRY_DSN", "");
export const SENTRY_ENVIRONMENT = readString(
  "NEXT_PUBLIC_SENTRY_ENV",
  IS_PRODUCTION ? "production" : "development",
);
export const IS_SENTRY_ENABLED = SENTRY_DSN !== "";

// ─────────────────────────────────────────────────────────────────────────────
// Clerk (auth)
// ─────────────────────────────────────────────────────────────────────────────
//
// When `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set the app routes
// authentication through Clerk:
//
//   - `<ClerkProvider>` wraps the layout (see `app/layout.tsx`).
//   - `useSession` reads from `useUser()` instead of `repo.auth`.
//   - `AuthModal` renders Clerk's `<SignIn />` instead of the demo
//     email+password form.
//   - Server Actions in `app/actions/db.ts` authorize via `auth()`
//     from `@clerk/nextjs/server` instead of the HMAC cookie.
//
// When the key is empty (CI, local dev without `.env.local`, or any
// deployment that hasn't installed the Netlify Clerk extension), every
// surface above falls back to the previous behaviour — localStorage
// auth + the HMAC cookie. The dev bypass (`IS_ADMIN_BYPASS_ENABLED`)
// also keeps working in either mode.
//
// Direct dot-access for the same reason as `IS_NETLIFY_DB_ENABLED`:
// Turbopack only inlines `process.env.X` for `NEXT_PUBLIC_*` keys when
// referenced literally at the call site. Bracket-access via
// `readString` defeats the substitution.

export const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
export const IS_CLERK_ENABLED = CLERK_PUBLISHABLE_KEY !== "";

/**
 * Comma-separated allowlist of admin emails. Provides the "first
 * admin" path before any user can be promoted via Clerk's public
 * metadata: any authenticated user whose primary email matches an
 * entry in this list is treated as `role: "admin"`, even if their
 * Clerk profile has no `publicMetadata.role` set.
 *
 * Why both: in the bootstrap flow there are no admins yet, so the
 * admin can't promote themselves through Clerk's dashboard until
 * they've at least logged in once. The env var lets the very first
 * sign-in already land as admin. Once the admin is in, they can
 * manage roles via Clerk metadata and remove themselves from the env
 * list (or keep it as a safety net).
 *
 * Comparison is case-insensitive. Empty string disables the fallback.
 */
function parseAdminEmails(raw: string): readonly string[] {
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}
export const ADMIN_EMAILS: readonly string[] = parseAdminEmails(
  // Server-only env — not bundled. The list is consulted only inside
  // server-side helpers (`lib/server/session.ts`) and inside
  // client-side `useSession` via the user's email (which comes from
  // Clerk and is safe to compare client-side).
  process.env.ADMIN_EMAILS ?? readString("NEXT_PUBLIC_ADMIN_EMAILS", ""),
);

/** True iff `email` should be treated as admin via the env allowlist. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
