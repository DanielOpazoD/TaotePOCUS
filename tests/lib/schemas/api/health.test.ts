// Contract tests for /api/health. Each scenario pins one cell of the
// truth table — a successful parse with all fields, a successful
// parse with the nullable build fields, a parse failure per required
// field. Strict mode catches a typo'd field name (e.g. `tsz` instead
// of `ts`) which TypeScript wouldn't if the producer used `as any`.

import { describe, expect, it } from "vitest";
import { healthResponseSchema, type HealthResponse } from "@/lib/schemas/api/health";

const baseHealth: HealthResponse = {
  ok: true,
  build: { commit: "abc123", deployedAt: "2026-05-22T00:00:00Z" },
  checks: {
    db: { ok: true, latencyMs: 12 },
    blobs: { ok: true },
  },
  ts: "2026-05-22T00:00:01Z",
};

describe("healthResponseSchema", () => {
  it("accepts a complete, well-formed response", () => {
    const r = healthResponseSchema.safeParse(baseHealth);
    expect(r.success).toBe(true);
  });

  it("accepts null build.commit + null deployedAt (local dev / manual deploy)", () => {
    const r = healthResponseSchema.safeParse({
      ...baseHealth,
      build: { commit: null, deployedAt: null },
    });
    expect(r.success).toBe(true);
  });

  it("accepts check entries without latencyMs (cheap path)", () => {
    const r = healthResponseSchema.safeParse({
      ...baseHealth,
      checks: { db: { ok: true }, blobs: { ok: true } },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a failed check with an error string", () => {
    const r = healthResponseSchema.safeParse({
      ...baseHealth,
      ok: false,
      checks: {
        db: { ok: false, latencyMs: 35, error: "timeout" },
        blobs: { ok: true },
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects when `ok` is missing", () => {
    const { ok: _ok, ...rest } = baseHealth;
    const r = healthResponseSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects when `ts` is not a datetime string", () => {
    const r = healthResponseSchema.safeParse({ ...baseHealth, ts: "yesterday" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown extra fields (strict mode)", () => {
    const r = healthResponseSchema.safeParse({ ...baseHealth, extraField: "leak" });
    expect(r.success).toBe(false);
  });

  it("rejects negative latencyMs", () => {
    const r = healthResponseSchema.safeParse({
      ...baseHealth,
      checks: { db: { ok: true, latencyMs: -1 }, blobs: { ok: true } },
    });
    expect(r.success).toBe(false);
  });
});
