// Unit tests for the RUM aggregation math. These don't touch
// Netlify Blobs or the HTTP layer — they're pure-function tests
// of `percentile` and `summarize`. The contract validated here is
// what the admin dashboard reads, so if these pass the rendered
// numbers are trustworthy.

import { describe, expect, it } from "vitest";
import { percentile, summarize } from "@/lib/percentiles";

describe("percentile", () => {
  it("returns 0 on empty input (consumer is expected to gate on count>0)", () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([], 95)).toBe(0);
  });

  it("returns the only value when length is 1", () => {
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 100)).toBe(42);
  });

  it("interpolates linearly between adjacent ranks (Lighthouse method)", () => {
    // 4-element series → rank for p25 = 0.75, so result is
    // values[0] * 0.25 + values[1] * 0.75.
    const xs = [10, 20, 30, 40];
    expect(percentile(xs, 0)).toBe(10);
    expect(percentile(xs, 100)).toBe(40);
    // p25: rank = 0.25 * 3 = 0.75 → 10 + 0.75 * (20 - 10) = 17.5
    expect(percentile(xs, 25)).toBeCloseTo(17.5, 6);
    // p50: rank = 0.5 * 3 = 1.5 → 20 + 0.5 * (30 - 20) = 25
    expect(percentile(xs, 50)).toBeCloseTo(25, 6);
    // p75: rank = 0.75 * 3 = 2.25 → 30 + 0.25 * (40 - 30) = 32.5
    expect(percentile(xs, 75)).toBeCloseTo(32.5, 6);
  });

  it("handles a realistic LCP distribution (ms) without surprises", () => {
    const lcps = [800, 1000, 1200, 1400, 1600, 1900, 2300, 2900, 3800, 5200];
    // Sorted already. p75: rank = 0.75 * 9 = 6.75
    //   → 2300 + 0.75 * (2900 - 2300) = 2750
    expect(percentile(lcps, 75)).toBeCloseTo(2750, 6);
    // p95: rank = 0.95 * 9 = 8.55
    //   → 3800 + 0.55 * (5200 - 3800) = 4570
    expect(percentile(lcps, 95)).toBeCloseTo(4570, 6);
  });
});

describe("summarize", () => {
  it("returns zeros for an empty array", () => {
    const stats = summarize([]);
    expect(stats).toEqual({ p50: 0, p75: 0, p95: 0, count: 0 });
  });

  it("rounds integer-precision metrics to whole numbers", () => {
    const stats = summarize([1000, 1100, 1200, 1300, 1400]);
    expect(stats.count).toBe(5);
    // All percentiles fall on exact indices for n=5 with the
    // interpolation formula; numbers are integer round-tripped.
    expect(Number.isInteger(stats.p50)).toBe(true);
    expect(Number.isInteger(stats.p75)).toBe(true);
    expect(Number.isInteger(stats.p95)).toBe(true);
  });

  it("rounds CLS precision to 4 decimals when requested", () => {
    const stats = summarize([0.01, 0.0234, 0.05789, 0.123, 0.34567], { precision: 4 });
    // Sorted = [0.01, 0.0234, 0.05789, 0.123, 0.34567].
    // p50: rank 2.0 → arr[2] = 0.05789 → rounded 0.0579.
    // p75: rank 3.0 → arr[3] = 0.123 (exact index, no interpolation).
    // p95: rank 3.8 → 0.123 + 0.8 * (0.34567 - 0.123) = 0.301136
    //   → rounded 0.3011.
    expect(stats.p50).toBeCloseTo(0.0579, 4);
    expect(stats.p75).toBeCloseTo(0.123, 4);
    expect(stats.p95).toBeCloseTo(0.3011, 4);
  });

  it("sorts the input — order-independent", () => {
    const a = summarize([5, 1, 4, 2, 3]);
    const b = summarize([1, 2, 3, 4, 5]);
    expect(a).toEqual(b);
  });

  it("preserves count exactly", () => {
    const stats = summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(stats.count).toBe(10);
  });
});
