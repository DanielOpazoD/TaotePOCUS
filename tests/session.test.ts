// Unit tests for the server-side session helper. Covers the
// signing / verification surface only — the cookie I/O paths
// (`getSession`, `requireAdmin`, `requireAuth`) need a Next.js
// request context to invoke `cookies()`, which the happy-dom
// runtime doesn't provide. Those are exercised indirectly via the
// Server Actions in `app/actions/db.ts` (covered by e2e).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock `next/headers` so importing the module under test doesn't
// fail. The test never calls the cookie-based functions.
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

// `NODE_ENV` is typed as a read-only literal union by `@types/node`,
// but at runtime it's a normal string property. The cast lets us
// flip it for the production-fallback test without a `// @ts-expect-
// error` per assignment.
const env = process.env as Record<string, string | undefined>;

const ORIGINAL_AUTH_SECRET = env.AUTH_SECRET;
const ORIGINAL_NODE_ENV = env.NODE_ENV;

async function loadSession() {
  // Re-import after mutating env so the secret-cache logic re-runs.
  vi.resetModules();
  return import("@/lib/server/session");
}

describe("server/session: signSessionToken / verifySessionToken", () => {
  beforeEach(() => {
    env.AUTH_SECRET = "test-secret-test-secret-test-secret"; // ≥16 chars
    env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (ORIGINAL_AUTH_SECRET === undefined) delete env.AUTH_SECRET;
    else env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
    if (ORIGINAL_NODE_ENV === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it("signs and verifies a roundtrip", async () => {
    const { signSessionToken, verifySessionToken } = await loadSession();
    const payload = {
      email: "u@example.com",
      role: "admin" as const,
      iat: Date.now(),
      exp: Date.now() + 60_000,
    };
    const token = signSessionToken(payload);
    expect(token).toBeTruthy();
    const verified = verifySessionToken(token!);
    expect(verified).not.toBeNull();
    expect(verified?.email).toBe("u@example.com");
    expect(verified?.role).toBe("admin");
  });

  it("rejects a token whose payload was tampered with", async () => {
    const { signSessionToken, verifySessionToken } = await loadSession();
    const token = signSessionToken({
      email: "victim@example.com",
      role: "user",
      iat: Date.now(),
      exp: Date.now() + 60_000,
    })!;
    // Splice in a different payload while keeping the original signature.
    const sig = token.split(".")[1];
    const tampered = Buffer.from(
      JSON.stringify({
        email: "attacker@example.com",
        role: "admin",
        iat: Date.now(),
        exp: Date.now() + 60_000,
      }),
      "utf8",
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const forged = `${tampered}.${sig}`;
    expect(verifySessionToken(forged)).toBeNull();
  });

  it("rejects a token whose signature was tampered with", async () => {
    const { signSessionToken, verifySessionToken } = await loadSession();
    const token = signSessionToken({
      email: "u@example.com",
      role: "admin",
      iat: Date.now(),
      exp: Date.now() + 60_000,
    })!;
    const [body] = token.split(".");
    expect(verifySessionToken(`${body}.AAAAAAAA`)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { signSessionToken, verifySessionToken } = await loadSession();
    const token = signSessionToken({
      email: "u@example.com",
      role: "user",
      iat: Date.now() - 120_000,
      exp: Date.now() - 60_000, // expired 1 minute ago
    })!;
    expect(verifySessionToken(token)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    const { verifySessionToken } = await loadSession();
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken(null)).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken("nodot")).toBeNull();
    expect(verifySessionToken(".empty-body")).toBeNull();
    expect(verifySessionToken("empty-sig.")).toBeNull();
    expect(verifySessionToken("not-base64!!.also-not-base64!!")).toBeNull();
  });

  it("rejects tokens signed with a different secret", async () => {
    const { signSessionToken } = await loadSession();
    const token = signSessionToken({
      email: "u@example.com",
      role: "admin",
      iat: Date.now(),
      exp: Date.now() + 60_000,
    })!;
    // Rotate the secret — the prior token must no longer verify.
    env.AUTH_SECRET = "different-secret-different-secret";
    const { verifySessionToken } = await loadSession();
    expect(verifySessionToken(token)).toBeNull();
  });

  it("isOwner is case-insensitive on email", async () => {
    const { isOwner } = await loadSession();
    const session = {
      email: "User@Example.COM",
      role: "user" as const,
      iat: Date.now(),
      exp: Date.now() + 60_000,
    };
    expect(isOwner(session, "user@example.com")).toBe(true);
    expect(isOwner(session, "USER@EXAMPLE.COM")).toBe(true);
    expect(isOwner(session, "other@example.com")).toBe(false);
    expect(isOwner(null, "user@example.com")).toBe(false);
    expect(isOwner(session, null)).toBe(false);
  });

  it("returns null when AUTH_SECRET is missing in production", async () => {
    delete env.AUTH_SECRET;
    env.NODE_ENV = "production";
    const { signSessionToken, verifySessionToken } = await loadSession();
    expect(
      signSessionToken({
        email: "u@example.com",
        role: "admin",
        iat: Date.now(),
        exp: Date.now() + 60_000,
      }),
    ).toBeNull();
    expect(verifySessionToken("anything.anything")).toBeNull();
  });
});
