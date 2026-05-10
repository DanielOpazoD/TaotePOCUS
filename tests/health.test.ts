// Pin the `/api/health` contract so dashboards / external monitors
// can rely on the response shape. Two flavors covered:
//
//   - Liveness (default): cheap, no dependency probes, always 200.
//   - Readiness (?deep=1): pings dependencies. Returns 503 on any
//     check failure with the failing field populated.
//
// We mock the env flag (`IS_NETLIFY_DB_ENABLED`) and the dynamic
// imports so neither @netlify/database nor lib/blobs is hit at test
// time — both expect a runtime that doesn't exist in vitest.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return { ...actual, IS_NETLIFY_DB_ENABLED: false };
});

import { GET } from "@/app/api/health/route";

beforeEach(() => {
  // The handler reads `process.env.COMMIT_REF` and
  // `process.env.NEXT_PUBLIC_BUILD_DATE` for the build metadata.
  // Pin them so tests don't depend on the host env.
  process.env.COMMIT_REF = "test-commit-1234";
  process.env.NEXT_PUBLIC_BUILD_DATE = "2026-05-10T00:00:00Z";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("liveness returns 200 with build metadata + ok checks", async () => {
    const res = await GET(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.build.commit).toBe("test-commit-1234");
    expect(body.build.deployedAt).toBe("2026-05-10T00:00:00Z");
    expect(body.checks.db.ok).toBe(true);
    expect(body.checks.blobs.ok).toBe(true);
    expect(typeof body.ts).toBe("string");
  });

  it("liveness sends `Cache-Control: no-store`", async () => {
    const res = await GET(new Request("http://localhost/api/health"));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("deep readiness returns 200 when DB flag is off + blobs available", async () => {
    // With IS_NETLIFY_DB_ENABLED=false (mocked above) the DB check
    // short-circuits to ok. blobs check imports lib/blobs which we
    // also mock — see the per-test setup pattern below.
    vi.doMock("@/lib/blobs", () => ({ mediaStore: { name: "test" } }));
    const { GET: deepGET } = await import("@/app/api/health/route");
    const res = await deepGET(new Request("http://localhost/api/health?deep=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checks.db.ok).toBe(true);
    expect(body.checks.blobs.ok).toBe(true);
  });

  it("deep readiness returns 503 when blobs is unavailable", async () => {
    vi.doMock("@/lib/blobs", () => ({ mediaStore: null }));
    vi.resetModules();
    const { GET: deepGET } = await import("@/app/api/health/route");
    const res = await deepGET(new Request("http://localhost/api/health?deep=1"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.checks.blobs.ok).toBe(false);
    expect(body.checks.blobs.error).toBe("store-unavailable");
  });

  it("response shape stays stable (no breaking renames)", async () => {
    const res = await GET(new Request("http://localhost/api/health"));
    const body = await res.json();
    // Pin top-level keys — external dashboards depend on these.
    expect(Object.keys(body).sort()).toEqual(["build", "checks", "ok", "ts"]);
    expect(Object.keys(body.build).sort()).toEqual(["commit", "deployedAt"]);
    expect(Object.keys(body.checks).sort()).toEqual(["blobs", "db"]);
  });
});
