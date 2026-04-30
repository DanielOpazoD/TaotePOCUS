"use server";

// Server Actions to mint and clear the server-side session cookie.
// Lives in its own file so `app/actions/db.ts` doesn't grow another
// concern, and so the client-side `lib/repo.ts > localAuth` can call
// these directly at login/logout without depending on the DB module.
//
// The cookie is the *server's* view of who's logged in. The client
// also keeps its own session in localStorage (for offline tabs and the
// dev demo flow), but every Server Action consults the cookie — never
// the client-supplied identity — when authorizing.

import { cookies } from "next/headers";

import { signSessionToken, SESSION_COOKIE, type SessionPayload } from "@/lib/server/session";
import { IS_PRODUCTION } from "@/lib/env";

export interface SetSessionInput {
  email: string;
  role: "admin" | "user";
  /** Unix ms — when the session should expire. Mirrors `User.expiresAt`. */
  expiresAt: number;
}

/**
 * Mint a signed session cookie. Called from the client login flow
 * after the local auth succeeds. Returns `{ ok: false }` if the
 * server can't sign tokens (production with no `AUTH_SECRET`); the
 * caller should treat this as a degraded state — the local session
 * still works, but DB writes will be rejected.
 */
export async function setSessionAction(
  input: SetSessionInput,
): Promise<{ ok: true } | { ok: false; reason: "signing_unavailable" | "invalid" }> {
  if (
    !input ||
    typeof input.email !== "string" ||
    !input.email.trim() ||
    (input.role !== "admin" && input.role !== "user") ||
    typeof input.expiresAt !== "number" ||
    input.expiresAt <= Date.now()
  ) {
    return { ok: false, reason: "invalid" };
  }
  const payload: SessionPayload = {
    email: input.email.trim().toLowerCase(),
    role: input.role,
    iat: Date.now(),
    exp: input.expiresAt,
  };
  const token = signSessionToken(payload);
  if (!token) return { ok: false, reason: "signing_unavailable" };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: "/",
    // `expires` (absolute) rather than `maxAge` (relative) so the
    // cookie's lifetime tracks the token's `exp` exactly. Browsers
    // will discard the cookie at the same moment the server stops
    // accepting it.
    expires: new Date(input.expiresAt),
  });
  return { ok: true };
}

/**
 * Clear the session cookie. Called from the client logout flow.
 * Idempotent — safe to call when the cookie isn't set.
 */
export async function clearSessionAction(): Promise<{ ok: true }> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return { ok: true };
}
