// GET /api/health — liveness + readiness probe.
//
// Two flavors:
//   - GET /api/health → 200 with build metadata + a flag per dependency
//     (`db`, `blobs`). Used by external uptime monitors (Netlify
//     Uptime, Better Stack, Pingdom, etc.) and by load balancers
//     deciding whether to send traffic.
//   - GET /api/health?deep=1 → same shape but actually pings each
//     dependency (DB SELECT 1, Blobs head). Slow (~50-200ms); call
//     sparingly. The plain endpoint is the one external monitors
//     should hit on a 60s cadence.
//
// Response shape is stable so dashboards can scrape it without breaking
// on a refactor:
//
//     {
//       "ok": true,
//       "build": { "commit": "abc123", "deployedAt": "2026-05-10T..." },
//       "checks": {
//         "db":    { "ok": true,  "latencyMs": 23 },
//         "blobs": { "ok": true }
//       },
//       "ts": "2026-05-10T03:10:00Z"
//     }
//
// `ok: false` flips when ANY check fails. Partial failure (DB down,
// blobs up) returns 503 so monitors trip immediately. The shape stays
// the same so the failing dependency is identifiable by field.
//
// Security: no auth required. The endpoint exposes nothing beyond
// "is this deployment alive and connected to its dependencies?" — no
// case data, no user data, no env vars. Public uptime monitors are
// the intended audience.

import { NextResponse } from "next/server";
import { IS_NETLIFY_DB_ENABLED } from "@/lib/env";

interface CheckResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

interface HealthPayload {
  ok: boolean;
  build: {
    commit: string | null;
    deployedAt: string | null;
  };
  checks: {
    db: CheckResult;
    blobs: CheckResult;
  };
  ts: string;
}

/** Ping the database with a `SELECT 1`. Returns latency on success,
 *  error message on failure. Skipped when the DB flag is off — the
 *  app falls back to localStorage and the DB isn't a hard dependency. */
async function checkDb(): Promise<CheckResult> {
  if (!IS_NETLIFY_DB_ENABLED) return { ok: true };
  const start = Date.now();
  try {
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    await db.sql`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

/** Confirm the Blobs store is reachable. We don't read a specific
 *  key (would need to know one); we just confirm the binding exists.
 *  In a fresh deploy the store is auto-provisioned, so a missing
 *  binding is a real misconfiguration worth surfacing. */
async function checkBlobs(): Promise<CheckResult> {
  try {
    const { mediaStore } = await import("@/lib/blobs");
    if (!mediaStore) return { ok: false, error: "store-unavailable" };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const deep = url.searchParams.get("deep") === "1";

  // Cheap path: report the build metadata + skip dependency probes.
  // External monitors hit this on a tight cadence — it costs nothing
  // and answers "is the function alive at all".
  if (!deep) {
    const payload: HealthPayload = {
      ok: true,
      build: {
        commit: process.env.COMMIT_REF ?? null,
        deployedAt: process.env.NEXT_PUBLIC_BUILD_DATE ?? null,
      },
      checks: {
        db: { ok: true },
        blobs: { ok: true },
      },
      ts: new Date().toISOString(),
    };
    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Deep path: round-trip every dependency. Used by humans
  // investigating an incident or by a deploy gate.
  const [db, blobs] = await Promise.all([checkDb(), checkBlobs()]);
  const payload: HealthPayload = {
    ok: db.ok && blobs.ok,
    build: {
      commit: process.env.COMMIT_REF ?? null,
      deployedAt: process.env.NEXT_PUBLIC_BUILD_DATE ?? null,
    },
    checks: { db, blobs },
    ts: new Date().toISOString(),
  };
  return NextResponse.json(payload, {
    status: payload.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
