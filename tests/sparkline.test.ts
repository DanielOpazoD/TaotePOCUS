import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSparkline } from "@/components/hero/sparkline";
import { caseFactory, resetIdCounter } from "./fixtures";

// Anchor "now" so monthly bucketing is deterministic across runs.
const NOW = new Date(2026, 3, 28); // 28 abr 2026

describe("buildSparkline", () => {
  beforeEach(() => {
    resetIdCounter();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for an empty case list", () => {
    expect(buildSparkline([], 6)).toBeNull();
  });

  it("returns a polyline points string with one entry per bucket", () => {
    // 1 case in the current month, 0 elsewhere.
    const cases = [caseFactory({ date: "2026-04-15" })];
    const result = buildSparkline(cases, 6);
    expect(result).not.toBeNull();
    // 6 buckets → 6 "x,y" entries separated by spaces.
    const points = result!.split(" ");
    expect(points).toHaveLength(6);
    // The latest bucket (rightmost) should be peaked. With max=1 the
    // peak y is 14 - 12 = 2; the empty buckets are at y=14.
    expect(points[5]).toMatch(/^60\.0,2\.0$/);
    expect(points[0]).toMatch(/,14\.0$/);
  });

  it("normalizes y to the max bucket value", () => {
    const cases = [
      // 3 cases in the current month
      caseFactory({ date: "2026-04-01" }),
      caseFactory({ date: "2026-04-15" }),
      caseFactory({ date: "2026-04-28" }),
      // 1 case last month
      caseFactory({ date: "2026-03-15" }),
    ];
    const result = buildSparkline(cases, 6);
    const points = result!.split(" ");
    // Bucket 5 (current month) has 3 cases → peak at y=2.
    expect(points[5]).toMatch(/,2\.0$/);
    // Bucket 4 (last month) has 1 case → y = 14 - (1/3)*12 = 10.0
    expect(points[4]).toMatch(/,10\.0$/);
  });

  it("ignores cases outside the requested window", () => {
    const cases = [
      caseFactory({ date: "2026-04-15" }), // in window
      caseFactory({ date: "2025-01-01" }), // way too old, should be dropped
    ];
    const result = buildSparkline(cases, 6);
    // Only the in-window case counts — the buckets stay at peak/zero.
    const points = result!.split(" ");
    expect(points[5]).toMatch(/,2\.0$/);
    // No mid-line bumps from the out-of-window case.
    expect(points.slice(0, 5).every((p) => p.endsWith(",14.0"))).toBe(true);
  });

  it("ignores future-dated cases", () => {
    // monthsAgo would be negative; the implementation gates that out.
    const cases = [caseFactory({ date: "2026-06-15" })];
    expect(buildSparkline(cases, 6)).toBeNull();
  });

  it("ignores cases with malformed dates", () => {
    const cases = [
      caseFactory({ date: "not-a-date" }),
      caseFactory({ date: "" }),
      caseFactory({ date: "2026-04-15" }),
    ];
    const result = buildSparkline(cases, 6);
    expect(result).not.toBeNull();
    const points = result!.split(" ");
    // The one valid case still produces the peak.
    expect(points[5]).toMatch(/,2\.0$/);
  });

  it("scales x positions evenly across the 60-unit viewBox", () => {
    const cases = Array.from({ length: 6 }, (_, i) =>
      caseFactory({ date: `2026-0${4 - Math.floor(i / 1)}-15` }),
    );
    const result = buildSparkline(cases, 6);
    const xs = result!.split(" ").map((p) => parseFloat(p.split(",")[0] ?? "0"));
    // 6 buckets → step is 60 / 5 = 12. Verify monotone + bounded.
    expect(xs[0]).toBe(0);
    expect(xs[5]).toBe(60);
    expect(xs[3]).toBeCloseTo(36, 5);
  });
});
