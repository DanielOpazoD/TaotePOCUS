// Tests for the aggregation function used by the admin metrics
// route. The function is pure (no Blobs, no HTTP) — we feed it
// synthetic events and assert the dashboard-shaped output.

import { describe, expect, it } from "vitest";
import { aggregate } from "@/app/api/admin/metrics/route";

interface Ev {
  n: "lcp" | "inp" | "cls" | "fcp" | "ttfb";
  v: number;
  r: string;
  vp: "mobile" | "tablet" | "desktop";
  t: number;
}

const day = (yyyymmdd: string, hour = 12): number =>
  new Date(`${yyyymmdd}T${String(hour).padStart(2, "0")}:00:00Z`).getTime();

describe("aggregate (RUM dashboard)", () => {
  it("returns zeros + empty arrays on no input", () => {
    const result = aggregate([], 30);
    expect(result.byMetric.lcp).toEqual({ p50: 0, p75: 0, p95: 0, count: 0 });
    expect(result.byRoute).toEqual([]);
    expect(result.series).toEqual([]);
    expect(result.meta.totalEvents).toBe(0);
    expect(result.meta.daysWithData).toBe(0);
    expect(result.meta.daysRequested).toBe(30);
  });

  it("computes byMetric percentiles across all events in window", () => {
    const events: Ev[] = Array.from({ length: 10 }, (_, i) => ({
      n: "lcp",
      v: (i + 1) * 100, // 100..1000
      r: "/",
      vp: "desktop",
      t: day("2026-05-21"),
    }));
    const out = aggregate(events, 30);
    expect(out.byMetric.lcp.count).toBe(10);
    // p50 of [100..1000]: rank 4.5 → 500 + 0.5*(600-500) = 550
    expect(out.byMetric.lcp.p50).toBe(550);
    // p75: rank 6.75 → 700 + 0.75*(800-700) = 775
    expect(out.byMetric.lcp.p75).toBe(775);
    // p95: rank 8.55 → 900 + 0.55*(1000-900) = 955
    expect(out.byMetric.lcp.p95).toBe(955);
  });

  it("groups events into a per-day series sorted chronologically", () => {
    const events: Ev[] = [
      { n: "lcp", v: 1000, r: "/", vp: "mobile", t: day("2026-05-19") },
      { n: "lcp", v: 1500, r: "/", vp: "mobile", t: day("2026-05-20") },
      { n: "lcp", v: 2000, r: "/", vp: "mobile", t: day("2026-05-21") },
    ];
    const out = aggregate(events, 30);
    expect(out.series).toHaveLength(3);
    expect(out.series.map((p) => p.date)).toEqual(["2026-05-19", "2026-05-20", "2026-05-21"]);
    // Each day has one event; p75 of a single value is itself.
    expect(out.series[0]!.lcpP75).toBe(1000);
    expect(out.series[2]!.lcpP75).toBe(2000);
  });

  it("filters out routes with fewer than 5 events", () => {
    const events: Ev[] = [
      // /atlas: 6 events → included
      ...Array.from({ length: 6 }, () => ({
        n: "lcp" as const,
        v: 1500,
        r: "/atlas",
        vp: "desktop" as const,
        t: day("2026-05-21"),
      })),
      // /ecg: 3 events → dropped (below 5 threshold)
      ...Array.from({ length: 3 }, () => ({
        n: "lcp" as const,
        v: 1200,
        r: "/ecg",
        vp: "desktop" as const,
        t: day("2026-05-21"),
      })),
    ];
    const out = aggregate(events, 30);
    expect(out.byRoute.map((r) => r.route)).toEqual(["/atlas"]);
  });

  it("sorts byRoute by total event count descending", () => {
    const mk = (route: string, n: number): Ev[] =>
      Array.from({ length: n }, () => ({
        n: "lcp" as const,
        v: 1500,
        r: route,
        vp: "desktop" as const,
        t: day("2026-05-21"),
      }));
    const events = [...mk("/a", 5), ...mk("/b", 20), ...mk("/c", 10)];
    const out = aggregate(events, 30);
    expect(out.byRoute.map((r) => r.route)).toEqual(["/b", "/c", "/a"]);
  });

  it("includes daysWithData + totalEvents in the meta block", () => {
    const events: Ev[] = [
      { n: "lcp", v: 1000, r: "/", vp: "mobile", t: day("2026-05-19") },
      { n: "lcp", v: 1500, r: "/", vp: "mobile", t: day("2026-05-19") },
      { n: "inp", v: 80, r: "/", vp: "mobile", t: day("2026-05-20") },
    ];
    const out = aggregate(events, 30);
    expect(out.meta.totalEvents).toBe(3);
    expect(out.meta.daysWithData).toBe(2);
    expect(out.meta.daysRequested).toBe(30);
  });

  it("computes byMetric independently per metric name", () => {
    const events: Ev[] = [
      { n: "lcp", v: 1000, r: "/", vp: "desktop", t: day("2026-05-21") },
      { n: "inp", v: 50, r: "/", vp: "desktop", t: day("2026-05-21") },
      { n: "cls", v: 0.05, r: "/", vp: "desktop", t: day("2026-05-21") },
    ];
    const out = aggregate(events, 30);
    expect(out.byMetric.lcp.count).toBe(1);
    expect(out.byMetric.lcp.p50).toBe(1000);
    expect(out.byMetric.inp.count).toBe(1);
    expect(out.byMetric.inp.p50).toBe(50);
    expect(out.byMetric.cls.count).toBe(1);
    expect(out.byMetric.cls.p50).toBeCloseTo(0.05, 4);
    expect(out.byMetric.fcp.count).toBe(0);
    expect(out.byMetric.ttfb.count).toBe(0);
  });
});
