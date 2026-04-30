// Server-side session: signed, httpOnly cookie that the Server Actions
// in `app/actions/db.ts` consult to authorize each request.
//
// Why a custom token instead of NextAuth or a third-party SDK:
//
//   - The app already has a localStorage-based identity (see `lib/repo.ts`
//     > `localAuth`). We don't need account creation, password resets,
//     OAuth, or session DB tables — we just need the server to *know*
//     who's calling so admin actions can refuse non-admins.
//   - The token is symmetric-signed (HMAC-SHA256) with a single
//     secret. No public-key crypto, no rotation story (yet) — when we
//     migrate to Firebase Auth or a real provider, this whole module
//     gets replaced wholesale, so over-engineering would be wasted.
//
// Token shape (joined by `.`):
//
//   payload = base64url(JSON({ email, role, exp, iat }))
//   sig     = base64url(HMAC-SHA256(payload, secret))
//
// Both halves are needed; tampering with either invalidates the
// signature and `verifySessionToken` returns null. `timingSafeEqual`
// prevents the trivial timing attack on signature comparison.
//
// Cookie attributes:
//
//   - httpOnly so a stored XSS can't read the token from `document.cookie`.
//   - sameSite=lax so a cross-origin POST can't ride the cookie.
//   - secure in production so the cookie is never sent over plain http.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { IS_PRODUCTION } from "../env";

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
 * Read the session from the request cookie. Returns null when there
 * is no cookie, the token is invalid, or the token has expired.
 *
 * Server Actions and Route Handlers can both call this — `cookies()`
 * works in either context.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  return verifySessionToken(raw);
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
