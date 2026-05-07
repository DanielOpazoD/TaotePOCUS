// Behavioral coverage for `lib/server/session.ts` — the HMAC-cookie
// session backend that gates every requireAuth / requireAdmin call in
// the Server Action surface (`app/actions/db.ts`).
//
// Why this test file exists (auditor verdict): the cookie-signing
// path is the production fallback when Clerk is not configured AND
// the active backend in dev / CI / any deploy without Clerk env. It
// had 57.47% coverage before Block K — `verifySessionToken`'s
// negative paths (corrupt body, bad signature length, expired,
// missing secret) were almost entirely unexercised.
//
// We deliberately do NOT test the Clerk branch here — that's covered
// in Block M when we consolidate the role resolution. This file
// pins the cookie path: signing, verification, the env-secret
// resolution rules, and the requireAuth / requireAdmin / isOwner
// helpers as composed against a controllable `cookies()` mock.

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────
// `cookies()` only works inside a real request context. Mock it to a
// stateful jar we can program per-test. The session module reads via
// `jar.get(SESSION_COOKIE)?.value`.
const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

// `lib/env` exposes `IS_PRODUCTION`, `IS_CLERK_ENABLED`, `isAdminEmail`.
// We pin `IS_CLERK_ENABLED` to `false` so getSession picks the cookie
// branch (Clerk is the subject of Block M). `IS_PRODUCTION` is exposed
// as a getter so tests can flip it via the helper below.
let prodFlag = false;
vi.mock("@/lib/env", () => ({
  get IS_PRODUCTION() {
    return prodFlag;
  },
  IS_CLERK_ENABLED: false,
  isAdminEmail: (email: string | null | undefined) =>
    !!email && email.toLowerCase() === "ops@example.com",
}));

// Pull the SUT after the mocks. We re-import in some tests via
// `vi.resetModules()` so the AUTH_SECRET / IS_PRODUCTION resolution
// runs fresh.
import {
  SESSION_COOKIE,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/server/session";

const STABLE_PAYLOAD = (overrides: Partial<SessionPayload> = {}): SessionPayload => ({
  email: "admin@x.com",
  role: "admin",
  iat: 1_700_000_000_000,
  exp: Date.now() + 24 * 60 * 60 * 1000,
  ...overrides,
});

beforeEach(() => {
  cookieStore.clear();
  prodFlag = false;
  process.env.AUTH_SECRET = "test-secret-thats-32-chars-long-aaaa";
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════════
// SIGNING + VERIFICATION
// ════════════════════════════════════════════════════════════════════

describe("signSessionToken / verifySessionToken — happy path", () => {
  it("a freshly signed token round-trips back to the original payload", () => {
    const payload = STABLE_PAYLOAD();
    const token = signSessionToken(payload);
    expect(token).not.toBeNull();
    const decoded = verifySessionToken(token);
    expect(decoded).toEqual(payload);
  });

  it("token is shaped as <body>.<sig> in base64url (no padding, no '+/' chars)", () => {
    const token = signSessionToken(STABLE_PAYLOAD())!;
    expect(token.includes(".")).toBe(true);
    expect(token).not.toMatch(/[+/=]/);
    const [body, sig] = token.split(".");
    expect(body!.length).toBeGreaterThan(0);
    expect(sig!.length).toBeGreaterThan(0);
  });

  it("identical payloads produce identical signatures (deterministic HMAC)", () => {
    const payload = STABLE_PAYLOAD();
    const a = signSessionToken(payload);
    const b = signSessionToken(payload);
    expect(a).toBe(b);
  });
});

describe("verifySessionToken — rejection paths", () => {
  it("returns null for null/undefined/empty token", () => {
    expect(verifySessionToken(null)).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken("")).toBeNull();
  });

  it("returns null for a token with no '.' separator", () => {
    expect(verifySessionToken("garbagewithoutdot")).toBeNull();
  });

  it("returns null for a token with leading/trailing dot (body or sig empty)", () => {
    expect(verifySessionToken(".sig")).toBeNull();
    expect(verifySessionToken("body.")).toBeNull();
  });

  it("returns null when the signature is the wrong length (length-mismatch guard)", () => {
    const token = signSessionToken(STABLE_PAYLOAD())!;
    const [body] = token.split(".");
    const tampered = `${body}.short`; // sig too short — distinct from "wrong but right-length sig"
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("returns null when the signature is the right length but mismatched (timing-safe compare)", () => {
    const token = signSessionToken(STABLE_PAYLOAD())!;
    const [body, sig] = token.split(".");
    // Flip every char to a bogus alphabet member to keep length the
    // same and trip the timingSafeEqual branch (not the length guard).
    const mutated = sig!.replace(/./g, (c) => (c === "A" ? "B" : "A"));
    expect(verifySessionToken(`${body}.${mutated}`)).toBeNull();
  });

  it("returns null when the body is not valid JSON (with a correct HMAC sig)", () => {
    // Hand-craft a token whose body is base64url(garbage) but
    // CORRECTLY signed with our test secret — this forces the HMAC
    // length + timing-safe equality checks to pass and exposes the
    // inner JSON.parse → catch → null path.
    const secret = Buffer.from(process.env.AUTH_SECRET!, "utf8");
    const garbage = Buffer.from("not json at all", "utf8").toString("base64");
    const body = garbage.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const sig = createHmac("sha256", secret)
      .update(body)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifySessionToken(`${body}.${sig}`)).toBeNull();
  });

  it("returns null when role is not 'admin' or 'user'", () => {
    // Patch the secret so we can sign + verify a custom payload that
    // bypasses TS to exercise the runtime shape guard.
    const bad = signSessionToken({
      ...STABLE_PAYLOAD(),
      role: "superuser" as unknown as SessionPayload["role"],
    });
    expect(verifySessionToken(bad)).toBeNull();
  });

  it("returns null when email is missing or wrong type", () => {
    const bad = signSessionToken({
      ...STABLE_PAYLOAD(),
      email: 42 as unknown as string,
    });
    expect(verifySessionToken(bad)).toBeNull();
  });

  it("returns null when exp is missing or wrong type", () => {
    const bad = signSessionToken({
      ...STABLE_PAYLOAD(),
      exp: "tomorrow" as unknown as number,
    });
    expect(verifySessionToken(bad)).toBeNull();
  });

  it("returns null when iat is missing or wrong type", () => {
    const bad = signSessionToken({
      ...STABLE_PAYLOAD(),
      iat: undefined as unknown as number,
    });
    expect(verifySessionToken(bad)).toBeNull();
  });

  it("returns null when the token has expired", () => {
    const expired = signSessionToken(STABLE_PAYLOAD({ exp: Date.now() - 1 }));
    expect(verifySessionToken(expired)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// SECRET RESOLUTION
// ════════════════════════════════════════════════════════════════════

describe("getSecret() resolution rules", () => {
  it("rejects an AUTH_SECRET shorter than 16 chars (uses dev fallback in non-prod)", async () => {
    vi.resetModules();
    process.env.AUTH_SECRET = "short";
    prodFlag = false;
    const mod = await import("@/lib/server/session");
    // The signing should still succeed because dev fallback kicks in.
    const token = mod.signSessionToken(STABLE_PAYLOAD());
    expect(token).not.toBeNull();
  });

  it("returns null when AUTH_SECRET is missing in production (fail-closed signing)", async () => {
    vi.resetModules();
    delete process.env.AUTH_SECRET;
    prodFlag = true;
    const mod = await import("@/lib/server/session");
    const token = mod.signSessionToken(STABLE_PAYLOAD());
    expect(token).toBeNull();
  });

  it("returns null when AUTH_SECRET is missing in production (fail-closed verification)", async () => {
    vi.resetModules();
    delete process.env.AUTH_SECRET;
    prodFlag = true;
    const mod = await import("@/lib/server/session");
    expect(mod.verifySessionToken("anything.atall")).toBeNull();
  });

  it("uses a transient per-process secret in dev when AUTH_SECRET is missing", async () => {
    vi.resetModules();
    delete process.env.AUTH_SECRET;
    prodFlag = false;
    const mod = await import("@/lib/server/session");
    // Same module instance → same transient secret → token round-trips.
    const token = mod.signSessionToken(STABLE_PAYLOAD());
    const back = mod.verifySessionToken(token);
    expect(back).not.toBeNull();
    expect(back?.email).toBe("admin@x.com");
  });

  it("a token signed with secret A does not verify under secret B", async () => {
    vi.resetModules();
    process.env.AUTH_SECRET = "secret-A-aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    prodFlag = false;
    const modA = await import("@/lib/server/session");
    const tokenFromA = modA.signSessionToken(STABLE_PAYLOAD());

    vi.resetModules();
    process.env.AUTH_SECRET = "secret-B-bbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const modB = await import("@/lib/server/session");
    expect(modB.verifySessionToken(tokenFromA)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// COOKIE → SESSION RESOLUTION (getSession / requireAuth / requireAdmin)
// ════════════════════════════════════════════════════════════════════

describe("getSession / requireAuth / requireAdmin via cookie", () => {
  // The "getSecret() resolution rules" suite above resets modules and
  // mutates AUTH_SECRET, so the singleton module state can leak across
  // describes. Reset + re-import here so the sign/verify instance both
  // bind to the SAME secret. Otherwise we'd sign with the
  // top-level-imported module (one secret) and verify through the
  // dynamically-imported module (different secret) and the cookie
  // would never validate.
  beforeEach(() => {
    vi.resetModules();
    process.env.AUTH_SECRET = "test-secret-thats-32-chars-long-aaaa";
  });

  it("returns null when no cookie is set", async () => {
    const { requireAuth, requireAdmin } = await import("@/lib/server/session");
    expect(await requireAuth()).toBeNull();
    expect(await requireAdmin()).toBeNull();
  });

  it("returns the payload when a valid token is in the cookie jar", async () => {
    const mod = await import("@/lib/server/session");
    const token = mod.signSessionToken(STABLE_PAYLOAD())!;
    cookieStore.set(SESSION_COOKIE, token);
    const session = await mod.requireAuth();
    expect(session?.email).toBe("admin@x.com");
    expect(session?.role).toBe("admin");
  });

  it("returns null when the cookie holds a tampered token", async () => {
    const mod = await import("@/lib/server/session");
    const token = mod.signSessionToken(STABLE_PAYLOAD())!;
    // Flip one char in the body — sig no longer verifies.
    const [body, sig] = token.split(".");
    const tampered = body!.slice(0, -1) + (body!.endsWith("A") ? "B" : "A") + "." + sig;
    cookieStore.set(SESSION_COOKIE, tampered);
    expect(await mod.requireAuth()).toBeNull();
  });

  it("requireAdmin returns null for a valid 'user' role session", async () => {
    const mod = await import("@/lib/server/session");
    const token = mod.signSessionToken(STABLE_PAYLOAD({ role: "user" }))!;
    cookieStore.set(SESSION_COOKIE, token);
    expect((await mod.requireAuth())?.role).toBe("user");
    expect(await mod.requireAdmin()).toBeNull();
  });

  it("requireAdmin returns the session for a valid 'admin' role session", async () => {
    const mod = await import("@/lib/server/session");
    const token = mod.signSessionToken(STABLE_PAYLOAD({ role: "admin" }))!;
    cookieStore.set(SESSION_COOKIE, token);
    expect((await mod.requireAdmin())?.role).toBe("admin");
  });

  it("requireAuth returns null when the cookie token is expired", async () => {
    const mod = await import("@/lib/server/session");
    const token = mod.signSessionToken(STABLE_PAYLOAD({ exp: Date.now() - 1000 }))!;
    cookieStore.set(SESSION_COOKIE, token);
    expect(await mod.requireAuth()).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// isOwner — ownership check helper
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// CLERK BRANCH — getClerkSession is exercised when IS_CLERK_ENABLED.
// The unification of these two backends is Block M's territory; here
// we just pin the mapping so the existing branch is reachable from
// tests and a regression in the email/role resolution is loud.
// ════════════════════════════════════════════════════════════════════

describe("getSession via Clerk branch", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.AUTH_SECRET = "test-secret-thats-32-chars-long-aaaa";
    // Flip the Clerk flag for this suite. The mock above re-evaluates
    // on every dynamic import because we use a getter on
    // IS_PRODUCTION; for IS_CLERK_ENABLED we redefine the module mock
    // inline before each import.
    vi.doMock("@/lib/env", () => ({
      get IS_PRODUCTION() {
        return prodFlag;
      },
      IS_CLERK_ENABLED: true,
      isAdminEmail: (email: string | null | undefined) =>
        !!email && email.toLowerCase() === "ops@example.com",
    }));
  });

  function mockClerkUser(user: unknown) {
    vi.doMock("@clerk/nextjs/server", () => ({
      currentUser: vi.fn(async () => user),
    }));
  }

  it("returns null when Clerk reports no user", async () => {
    mockClerkUser(null);
    const { requireAuth } = await import("@/lib/server/session");
    expect(await requireAuth()).toBeNull();
  });

  it("maps a Clerk user to a SessionPayload (admin via env allowlist)", async () => {
    mockClerkUser({
      primaryEmailAddressId: "ea_1",
      emailAddresses: [{ id: "ea_1", emailAddress: "OPS@example.com" }],
      publicMetadata: {},
      createdAt: 1_700_000_000_000,
    });
    const { requireAuth } = await import("@/lib/server/session");
    const session = await requireAuth();
    expect(session?.email).toBe("ops@example.com");
    expect(session?.role).toBe("admin");
    expect(session?.iat).toBe(1_700_000_000_000);
  });

  it("maps publicMetadata.role='admin' to admin (independent of allowlist)", async () => {
    mockClerkUser({
      primaryEmailAddressId: "ea_1",
      emailAddresses: [{ id: "ea_1", emailAddress: "other@x.com" }],
      publicMetadata: { role: "admin" },
      createdAt: new Date("2026-01-01T00:00:00Z"), // also accepts Date
    });
    const { requireAuth, requireAdmin } = await import("@/lib/server/session");
    const session = await requireAuth();
    expect(session?.email).toBe("other@x.com");
    expect(session?.role).toBe("admin");
    expect(await requireAdmin()).not.toBeNull();
  });

  it("falls back to the first email when primaryEmailAddressId doesn't match", async () => {
    mockClerkUser({
      primaryEmailAddressId: "missing",
      emailAddresses: [
        { id: "ea_1", emailAddress: "first@x.com" },
        { id: "ea_2", emailAddress: "second@x.com" },
      ],
      publicMetadata: {},
      createdAt: 0,
    });
    const { requireAuth } = await import("@/lib/server/session");
    const session = await requireAuth();
    expect(session?.email).toBe("first@x.com");
    expect(session?.role).toBe("user"); // not in allowlist, no admin metadata
  });

  it("returns null when the user has no email at all", async () => {
    mockClerkUser({
      primaryEmailAddressId: null,
      emailAddresses: [],
      publicMetadata: {},
      createdAt: 0,
    });
    const { requireAuth } = await import("@/lib/server/session");
    expect(await requireAuth()).toBeNull();
  });
});

describe("isOwner", () => {
  it("returns false when session is null", async () => {
    const { isOwner } = await import("@/lib/server/session");
    expect(isOwner(null, "anyone@x.com")).toBe(false);
  });

  it("returns false when email is null/empty", async () => {
    const { isOwner } = await import("@/lib/server/session");
    const session = STABLE_PAYLOAD();
    expect(isOwner(session, null)).toBe(false);
    expect(isOwner(session, "")).toBe(false);
    expect(isOwner(session, undefined)).toBe(false);
  });

  it("returns true when emails match (case-insensitive)", async () => {
    const { isOwner } = await import("@/lib/server/session");
    const session = STABLE_PAYLOAD({ email: "Admin@Example.COM" });
    expect(isOwner(session, "admin@example.com")).toBe(true);
    expect(isOwner(session, "ADMIN@example.com")).toBe(true);
  });

  it("returns false when emails differ", async () => {
    const { isOwner } = await import("@/lib/server/session");
    const session = STABLE_PAYLOAD({ email: "a@x.com" });
    expect(isOwner(session, "b@x.com")).toBe(false);
  });
});
