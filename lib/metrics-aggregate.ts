// Pure aggregation function for the RUM dashboard. Extracted out
// of `app/api/admin/metrics/route.ts` because Next.js's Route
// Handler typecheck only permits a fixed set of exported names
// from `route.ts` files (GET, POST, dynamic, revalidate, …) —
// any other export is a build-time error ("not a valid Route
// export field"). Living here keeps the function unit-testable
// without bending the route file's contract.
//
// All shape definitions + the helper live together so the route
// (consumer) and the test (consumer) import from one place.

import { precisionFor, summarize, type MetricStats } from "@/lib/percentiles";

/** Shape of an event stored in Netlify Blobs by
 *  `/api/metrics/report`. Compact field names match the wire
 *  protocol in `lib/rum.ts`. */
export interface StoredEvent {
  n: "lcp" | "inp" | "cls" | "fcp" | "ttfb";
  v: number;
  r: string;
  vp: "mobile" | "tablet" | "desktop";
  t: number;
}

export interface ByMetric {
  lcp: MetricStats;
  inp: MetricStats;
  cls: MetricStats;
  fcp: MetricStats;
  ttfb: MetricStats;
}

export interface RouteRow {
  route: string;
  lcpP75: number;
  inpP75: number;
  clsP75: number;
  count: number;
}

export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  lcpP75: number;
  inpP75: number;
  clsP75: number;
  count: number;
}

export interface MetricsResponse {
  byMetric: ByMetric;
  byRoute: RouteRow[];
  series: SeriesPoint[];
  meta: {
    totalEvents: number;
    daysWithData: number;
    daysRequested: number;
    generatedAt: string; // ISO
  };
}

const MAX_ROUTES_RETURNED = 20;

/** Compute the dashboard-shaped response from a flat event list.
 *  Pure — no I/O, deterministic given the same input. Three
 *  aggregations stacked:
 *    - `byMetric`: p50/p75/p95 + count across every event.
 *    - `byRoute`: per-route p75 of LCP/INP/CLS; drops routes
 *      with <5 events; sorted by traffic; capped at top 20.
 *    - `series`: per-day p75 sparkline data, chronological. */
export function aggregate(events: StoredEvent[], daysRequested: number): MetricsResponse {
  // Initialised with all 5 metric names so the type system can
  // narrow `perMetric[ev.n]` to `number[]` instead of
  // `number[] | undefined` (noUncheckedIndexedAccess).
  const perMetric: Record<"lcp" | "inp" | "cls" | "fcp" | "ttfb", number[]> = {
    lcp: [],
    inp: [],
    cls: [],
    fcp: [],
    ttfb: [],
  };
  // Day → metric → values. Same shape as `perMetric` per bucket
  // so accesses are narrowed (no `| undefined`).
  type MetricBucket = Record<"lcp" | "inp" | "cls" | "fcp" | "ttfb", number[]>;
  const perDay = new Map<string, MetricBucket>();
  // Route → metric → values
  const perRoute = new Map<string, MetricBucket>();
  const daysSeen = new Set<string>();

  for (const ev of events) {
    perMetric[ev.n].push(ev.v);
    const day = new Date(ev.t).toISOString().slice(0, 10);
    daysSeen.add(day);
    let dayBucket = perDay.get(day);
    if (!dayBucket) {
      dayBucket = { lcp: [], inp: [], cls: [], fcp: [], ttfb: [] };
      perDay.set(day, dayBucket);
    }
    dayBucket[ev.n].push(ev.v);
    let routeBucket = perRoute.get(ev.r);
    if (!routeBucket) {
      routeBucket = { lcp: [], inp: [], cls: [], fcp: [], ttfb: [] };
      perRoute.set(ev.r, routeBucket);
    }
    routeBucket[ev.n].push(ev.v);
  }

  const byMetric: ByMetric = {
    lcp: summarize(perMetric.lcp, { precision: precisionFor("lcp") }),
    inp: summarize(perMetric.inp, { precision: precisionFor("inp") }),
    cls: summarize(perMetric.cls, { precision: precisionFor("cls") }),
    fcp: summarize(perMetric.fcp, { precision: precisionFor("fcp") }),
    ttfb: summarize(perMetric.ttfb, { precision: precisionFor("ttfb") }),
  };

  // Series: ascending chronological order so the sparkline renders
  // left-to-right oldest-to-newest. Each entry's `count` is the
  // total beacons across all metrics for that day.
  const series: SeriesPoint[] = [...perDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, bucket]) => {
      const lcpStats = summarize([...bucket.lcp], { precision: precisionFor("lcp") });
      const inpStats = summarize([...bucket.inp], { precision: precisionFor("inp") });
      const clsStats = summarize([...bucket.cls], { precision: precisionFor("cls") });
      const dayCount =
        bucket.lcp.length +
        bucket.inp.length +
        bucket.cls.length +
        bucket.fcp.length +
        bucket.ttfb.length;
      return {
        date,
        lcpP75: lcpStats.p75,
        inpP75: inpStats.p75,
        clsP75: clsStats.p75,
        count: dayCount,
      };
    });

  // Per-route: only return the top N by total event count so the
  // panel stays scannable. Routes with fewer than 5 events are
  // dropped — not enough samples to make a percentile meaningful.
  const byRoute: RouteRow[] = [...perRoute.entries()]
    .map(([route, bucket]) => {
      const lcpStats = summarize([...bucket.lcp], { precision: precisionFor("lcp") });
      const inpStats = summarize([...bucket.inp], { precision: precisionFor("inp") });
      const clsStats = summarize([...bucket.cls], { precision: precisionFor("cls") });
      const total =
        bucket.lcp.length +
        bucket.inp.length +
        bucket.cls.length +
        bucket.fcp.length +
        bucket.ttfb.length;
      return {
        route,
        lcpP75: lcpStats.p75,
        inpP75: inpStats.p75,
        clsP75: clsStats.p75,
        count: total,
      };
    })
    .filter((row) => row.count >= 5)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_ROUTES_RETURNED);

  return {
    byMetric,
    byRoute,
    series,
    meta: {
      totalEvents: events.length,
      daysWithData: daysSeen.size,
      daysRequested,
      generatedAt: new Date().toISOString(),
    },
  };
}
