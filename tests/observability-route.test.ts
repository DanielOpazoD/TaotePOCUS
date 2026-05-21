// Tests for `app/api/admin/observability/route.ts` — the read-only
// status endpoint for the observability stack.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockedRequireAdmin = vi.fn();
vi.mock("@/lib/server/session", () => ({
  requireAdmin: () => mockedRequireAdmin(),
}));

import { GET } from "@/app/api/admin/observability/route";

const ADMIN_SESSION = {
  email: "admin@taote.pocus",
  role: "admin",
  expiresAt: 0,
  issuedAt: 0,
};

beforeEach(() => {
  mockedRequireAdmin.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/observability", () => {
  it("returns 403 when no admin session", async () => {
    mockedRequireAdmin.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the status shape for an admin", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // Shape, not values — the env-derived fields depend on the
    // test runner's process.env which we don't fully control.
    expect(body).toHaveProperty("sentry");
    expect(body.sentry).toHaveProperty("enabled");
    expect(body.sentry).toHaveProperty("environment");
    expect(body.sentry).toHaveProperty("dsnHostname");
    expect(body).toHaveProperty("build");
    expect(body.build).toHaveProperty("nodeEnv");
    expect(body.build).toHaveProperty("commitSha");
  });

  it("strips the DSN public key — only the hostname is exposed", async () => {
    // The env value is locked in at module load (lib/env.ts), so we
    // can't dynamically swap DSN values from inside a test. Instead
    // we assert on the SHAPE invariant: the response surface never
    // includes a `dsn` field, only `dsnHostname` (which is either
    // null or a host-only string).
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await GET();
    const body = await res.json();
    expect(body.sentry.dsn).toBeUndefined();
    if (body.sentry.dsnHostname !== null) {
      // Hostname has no protocol, path, or auth components.
      expect(body.sentry.dsnHostname).not.toMatch(/^https?:\/\//);
      expect(body.sentry.dsnHostname).not.toMatch(/@/);
      expect(body.sentry.dsnHostname).not.toMatch(/\//);
    }
  });
});
