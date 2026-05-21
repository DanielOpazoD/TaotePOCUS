// GET /api/admin/metrics — aggregate the RUM event store into the
// shape the admin dashboard renders. Admin-only (403 otherwise).
//
// Aggregation: read the last N days (default 30) of `events/<day>/*`
// blobs, parse each as a `StoredEvent`, and compute three
// aggregations:
//
//   - `byMetric`: p50/p75/p95 + count per Core Web Vital, across
//     every event in the window.
//   - `byRoute`: per-route p75 of each metric. Lets the admin see
//     which surfaces are slow vs fine.
//   - `series`: per-day p75 for each metric (sparkline data). Lets
//     the admin eyeball regressions over time.
//
// Why no caching layer (yet): low volume + admin-only access means
// the dashboard is read maybe 10x per day. Re-aggregating on every
// request keeps the freshness story trivial. If volume grows, drop
// a cached rollup into Blobs and serve that with a short TTL.

import { metricsStore } from "@/lib/blobs";
import { requireAdmin } from "@/lib/server/session";
import { precisionFor, summarize, type MetricStats } from "@/lib/percentiles";

interface StoredEvent {
  n: "lcp" | "inp" | "cls" | "fcp" | "ttfb";
  v: number;
  r: string;
  vp: "mobile" | "tablet" | "desktop";
  t: number;
}

interface ByMetric {
  lcp: MetricStats;
  inp: MetricStats;
  cls: MetricStats;
  fcp: MetricStats;
  ttfb: MetricStats;
}

interface RouteRow {
  route: string;
  lcpP75: number;
  inpP75: number;
  clsP75: number;
  count: number;
}

interface SeriesPoint {
  date: string; // YYYY-MM-DD
  lcpP75: number;
  inpP75: number;
  clsP75: number;
  count: number;
}

interface MetricsResponse {
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

const METRIC_KEYS = ["lcp", "inp", "cls", "fcp", "ttfb"] as const;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;
const MAX_ROUTES_RETURNED = 20;

/** Build the list of YYYY-MM-DD strings we want to read, ending
 *  today (UTC). Cheap because N ≤ 90. */
function daysWindow(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Read every event blob under a single day's prefix. Handles
 *  Blobs pagination via the cursor. Returns parsed events; skips
 *  any blob that fails to parse (corruption / partial write). */
async function readDayEvents(
  store: ReturnType<typeof metricsStore>,
  day: string,
): Promise<StoredEvent[]> {
  const events: StoredEvent[] = [];
  // `paginate: true` returns an AsyncIterable that the runtime
  // walks page-by-page — the SDK handles cursors internally. We
  // accumulate keys first, then fan-out the reads so latency is
  // bounded by the slowest single read, not the sum.
  const keys: string[] = [];
  for await (const page of store.list({ prefix: `events/${day}/`, paginate: true })) {
    for (const b of page.blobs) keys.push(b.key);
  }
  const parsed = await Promise.all(
    keys.map(async (key) => {
      try {
        const v = (await store.get(key, { type: "json" })) as StoredEvent | null;
        return v;
      } catch {
        return null;
      }
    }),
  );
  for (const ev of parsed) if (ev) events.push(ev);
  return events;
}

/** Empty metric stats — used to seed the response when a metric
 *  has no events in the window. */
const ZERO_STATS: MetricStats = { p50: 0, p75: 0, p95: 0, count: 0 };

/** Compute the response shape from the parsed event list. Pure
 *  function — easy to unit-test independently of the Blobs read. */
export function aggregate(events: StoredEvent[], daysRequested: number): MetricsResponse {
  // Group by metric for byMetric and per-day-per-metric for series.
  // Initialized with all 5 metric names so the type system can
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
  // total beacons across all metrics for that day — useful as a
  // "traffic" sanity signal alongside the p75 line.
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

  // Per-route: only return the top N by total event count, so the
  // panel stays scannable even on a busy day. Routes with fewer
  // than 5 events are dropped (not enough to make a percentile
  // meaningful).
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

export async function GET(request: Request): Promise<Response> {
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get("days") ?? DEFAULT_DAYS);
  const days = Math.max(
    1,
    Math.min(MAX_DAYS, Number.isFinite(daysParam) ? daysParam : DEFAULT_DAYS),
  );

  const store = metricsStore();
  const window = daysWindow(days);
  // Fan-out across days so a 30-day window doesn't serialise 30
  // round-trips. The list-then-fan-out-the-reads pattern inside
  // `readDayEvents` is the inner-loop concurrency; this is the
  // outer.
  const events: StoredEvent[] = [];
  const results = await Promise.all(window.map((day) => readDayEvents(store, day)));
  for (const list of results) events.push(...list);

  // Reference ZERO_STATS so the linter doesn't flag it as unused —
  // the aggregator returns the metric-empty case via summarize()
  // which produces an equivalent shape, but the constant is kept
  // available for callers who want to render an "empty" placeholder
  // without computing a stats object.
  void ZERO_STATS;

  const response = aggregate(events, days);
  // Short cache to absorb dashboard-tab refreshes without
  // re-aggregating each time, but short enough that a new event
  // is visible within seconds.
  return Response.json(response, {
    headers: { "cache-control": "private, max-age=15" },
  });
}
