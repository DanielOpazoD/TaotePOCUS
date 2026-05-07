// Server-side session resolution for Server Actions in
// `app/actions/db.ts`. Two backends, picked at module load by
// `IS_CLERK_ENABLED`:
//
//   - Clerk (production with the Netlify Clerk extension): reads
//     `userId` and primary email from `auth()` / `currentUser()`. The
//     admin role comes from `publicMetadata.role === "admin"` OR
//     from the `ADMIN_EMAILS` env-var allowlist (bootstrap path).
//   - Legacy (no Clerk env): reads a signed httpOnly cookie minted by
//     `app/actions/session.ts`. HMAC-SHA256 over `{email, role, exp,
//     iat}` using `AUTH_SECRET`. Kept as a fallback so dev / CI / any
//     deploy without Clerk keeps working unchanged.
//
// Server Actions don't see the branch — they call `requireAuth` /
// `requireAdmin` / `isOwner` and get a `SessionPayload` regardless.
//
// Legacy cookie shape (when used):
//
//   payload = base64url(JSON({ email, role, exp, iat }))
//   sig     = base64url(HMAC-SHA256(payload, secret))
//
// Both halves are needed; tampering with either invalidates the
// signature and `verifySessionToken` returns null. `timingSafeEqual`
// prevents the trivial timing attack on signature comparison.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { IS_PRODUCTION, IS_CLERK_ENABLED } from "../env";
import { resolveRole } from "../clerk-auth";

export const SESSION_COOKIE = "pocus_session";

export interface SessionPayload {
  email: string;
  role: "admin" | "user";
  /** Unix ms — when the token expires. Mirrors the client `User.expiresAt`. */
  exp: number;
  /** Unix ms — when the token was issued. */
  iat: number;
}

/**
 * Resolve the HMAC secret. Order:
 *
 *   1. `AUTH_SECRET` env var — the only acceptable production source.
 *   2. Dev fallback — a per-process random secret. Logs a warning so
 *      the operator knows tokens won't survive a restart, then keeps
 *      going. Lets `npm run dev` work without configuring anything.
 *   3. Production with no secret — fail-closed: tokens can't be signed
 *      or verified. Every protected action will return `auth_required`,
 *      which surfaces the misconfiguration immediately rather than
 *      silently accepting unsigned cookies.
 *
 * The dev fallback lives in module-level state so the same value is
 * used for the lifetime of the process — otherwise a freshly-signed
 * token would fail verification on the next call.
 */
let cachedSecret: Buffer | null = null;
let warnedMissingSecret = false;

function getSecret(): Buffer | null {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cachedSecret = Buffer.from(fromEnv, "utf8");
    return cachedSecret;
  }
  if (IS_PRODUCTION) {
    if (!warnedMissingSecret) {
      console.error(
        "[session] AUTH_SECRET is unset in production — every authenticated " +
          "action will be rejected. Set AUTH_SECRET to a random 32+ char string.",
      );
      warnedMissingSecret = true;
    }
    return null;
  }
  // Dev fallback. Random 32 bytes is plenty for HS256.
  if (!warnedMissingSecret) {
    console.warn(
      "[session] AUTH_SECRET is unset; using a transient per-process secret. " +
        "Sessions will not survive a server restart. Set AUTH_SECRET in .env.local " +
        "to make tokens persistent in dev.",
    );
    warnedMissingSecret = true;
  }
  cachedSecret = randomBytes(32);
  return cachedSecret;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function hmac(secret: Buffer, payload: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

/**
 * Sign a payload. Returns `null` if the secret is unavailable (prod
 * with no `AUTH_SECRET`); the caller should treat that as "session
 * unavailable" and surface a configuration error.
 */
export function signSessionToken(payload: SessionPayload): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64urlEncode(hmac(secret, body));
  return `${body}.${sig}`;
}

/**
 * Verify a token. Returns the payload on success, or `null` for any
 * failure (bad shape, bad signature, expired, missing secret). We
 * never throw — callers branch on null.
 */
export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = hmac(secret, body);
    provided = b64urlDecode(sig);
  } catch {
    return null;
  }
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload.email !== "string" ||
    (payload.role !== "admin" && payload.role !== "user") ||
    typeof payload.exp !== "number" ||
    typeof payload.iat !== "number"
  ) {
    return null;
  }
  if (payload.exp < Date.now()) return null;
  return payload;
}

/**
 * Read the session from the request cookie (legacy backend). Returns
 * null when there is no cookie, the token is invalid, or the token
 * has expired. Server Actions and Route Handlers can both call this —
 * `cookies()` works in either context.
 */
async function getCookieSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  return verifySessionToken(raw);
}

/**
 * Read the session from Clerk's server helpers. Returns null when no
 * user is signed in. Maps the Clerk user to our `SessionPayload`
 * shape so the rest of the Server Action surface doesn't need to
 * know which backend answered.
 *
 * Lazy-imports `@clerk/nextjs/server` so the legacy build path
 * (without Clerk env vars) doesn't pull the SDK into the server
 * bundle. The import is awaited only when the flag says so.
 */
async function getClerkSession(): Promise<SessionPayload | null> {
  const { currentUser } = await import("@clerk/nextjs/server");
  const u = await currentUser();
  if (!u) return null;
  // Resolve the primary email — same logic as `lib/clerk-auth.ts >
  // getPrimaryEmail`, inlined here to avoid client/server module
  // crossover.
  const primaryId = u.primaryEmailAddressId;
  let email: string | null = null;
  if (primaryId && Array.isArray(u.emailAddresses)) {
    const match = u.emailAddresses.find((e) => e.id === primaryId);
    if (match) email = match.emailAddress.toLowerCase();
  }
  if (!email && Array.isArray(u.emailAddresses) && u.emailAddresses.length > 0) {
    email = (u.emailAddresses[0]?.emailAddress ?? "").toLowerCase() || null;
  }
  if (!email) return null;
  // Role decision goes through the shared `resolveRole` helper so the
  // server and client paths stay aligned. See ADR-0012 for the rule
  // (publicMetadata.role beats nothing; ADMIN_EMAILS is the safety
  // net during bootstrap and when metadata is unset).
  const role = resolveRole({
    email,
    publicMetadataRole: (u.publicMetadata as { role?: unknown } | null | undefined)?.role,
  });
  // Clerk's `currentUser().createdAt` is a number (epoch ms). Older
  // SDK versions exposed a Date — accept either, fall back to now.
  const createdAtRaw: unknown = (u as { createdAt?: unknown }).createdAt;
  const issued =
    typeof createdAtRaw === "number"
      ? createdAtRaw
      : createdAtRaw instanceof Date
        ? createdAtRaw.getTime()
        : Date.now();
  return {
    email,
    role,
    iat: issued,
    // Clerk owns the real session lifetime; we set a far-future `exp`
    // so the legacy expiry check at the bottom of `verifySessionToken`
    // (which also gates `requireAuth`) doesn't false-negative.
    exp: issued + 10 * 365 * 24 * 60 * 60 * 1000,
  };
}

/** Backend-agnostic session read. Picks Clerk when configured, the
 *  signed cookie otherwise. */
export async function getSession(): Promise<SessionPayload | null> {
  if (IS_CLERK_ENABLED) return getClerkSession();
  return getCookieSession();
}

/**
 * Authorization helpers. They return the session on success and
 * `null` on failure so callers can branch without throwing across the
 * Server Action boundary (where exceptions surface as opaque 500s).
 */
export async function requireAuth(): Promise<SessionPayload | null> {
  return getSession();
}

export async function requireAdmin(): Promise<SessionPayload | null> {
  const s = await getSession();
  return s && s.role === "admin" ? s : null;
}

/** True iff `email` matches the session's email (case-insensitive). */
export function isOwner(session: SessionPayload | null, email: string | null | undefined): boolean {
  if (!session || !email) return false;
  return session.email.toLowerCase() === email.toLowerCase();
}
