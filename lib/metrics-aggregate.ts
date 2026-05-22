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
  /** LCP element fingerprint — populated only for `n: "lcp"`
   *  beacons. See `lib/rum.ts:LcpElement` for the field rationale +
   *  privacy posture; `app/api/metrics/report/route.ts:validateBeacon`
   *  for the server-side shape validation. */
  el?: {
    tag: string;
    cls?: string;
    src?: string;
    txt?: string;
    w?: number;
    h?: number;
  };
}

/** Aggregated row in the "what's the LCP element actually?" table.
 *  One row per distinct fingerprint, capped at the top N by
 *  observation count. Identity is `tag` + `src` (for media) OR
 *  `tag` + `txt` (for text) so the same LCP element across users
 *  collapses into one row.
 *
 *  `worstLcp` is the p95 of LCP values observed for this element —
 *  the headline "this element is slow for the worst 5% of users".
 *  Use it to triage: a fingerprint with high count + high worstLcp
 *  is where the optimization is most leveraged. */
export interface LcpElementRow {
  /** Stable identity string: "IMG · /case/abc.jpg", "H1 · Atlas POCUS",
   *  etc. Built server-side so the panel doesn't repeat the format
   *  logic. */
  key: string;
  tag: string;
  /** First class name, when known. */
  cls?: string;
  /** Either the src (for media) or the truncated text (for text
   *  elements), whichever the fingerprint provided. */
  hint: string;
  /** Median rendered area (w × h) in px². Lets the dashboard sort
   *  by "actual visual weight" — a 800×600 hero is a more
   *  impactful LCP candidate than an 80×80 thumb. */
  medianAreaPx: number;
  /** Number of LCP beacons attributed to this fingerprint. */
  count: number;
  /** p75 of LCP values when this element was the candidate. */
  lcpP75: number;
  /** p95 — the slow tail. */
  lcpP95: number;
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
  /** Top LCP element fingerprints by observation count. Empty when
   *  no beacons carried the `el` field yet (older clients, or all
   *  beacons received from a client predating the instrumentation
   *  PR). Capped at MAX_LCP_ELEMENTS_RETURNED so the panel stays
   *  scannable. */
  lcpElements: LcpElementRow[];
  meta: {
    totalEvents: number;
    daysWithData: number;
    daysRequested: number;
    generatedAt: string; // ISO
  };
}

const MAX_ROUTES_RETURNED = 20;
const MAX_LCP_ELEMENTS_RETURNED = 10;

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

  // LCP element fingerprint distribution. Walks only the LCP events
  // (where `el` may be populated) and groups by a stable identity
  // string built from tag + src/text. Older clients that predate
  // the instrumentation pass simply don't have `el` — we skip them
  // and they don't contribute to the table.
  const perElement = new Map<
    string,
    {
      tag: string;
      cls?: string;
      hint: string;
      values: number[];
      areas: number[];
    }
  >();
  for (const ev of events) {
    if (ev.n !== "lcp" || !ev.el) continue;
    // Identity key: prefer src (concrete URL) over text. Falls back
    // to "tag only" when neither is present, which clusters every
    // unfingerprinted LCP under one row — still useful, but the
    // dashboard renders that row last.
    const hint = ev.el.src || ev.el.txt || "";
    const key = `${ev.el.tag}|${hint}`;
    let bucket = perElement.get(key);
    if (!bucket) {
      bucket = {
        tag: ev.el.tag,
        cls: ev.el.cls,
        hint,
        values: [],
        areas: [],
      };
      perElement.set(key, bucket);
    }
    bucket.values.push(ev.v);
    if (typeof ev.el.w === "number" && typeof ev.el.h === "number") {
      bucket.areas.push(ev.el.w * ev.el.h);
    }
  }

  const lcpElements: LcpElementRow[] = [...perElement.entries()]
    .map(([key, bucket]) => {
      const lcpStats = summarize([...bucket.values], { precision: precisionFor("lcp") });
      const areasSorted = [...bucket.areas].sort((a, b) => a - b);
      const medianAreaPx =
        areasSorted.length === 0 ? 0 : (areasSorted[Math.floor(areasSorted.length / 2)] ?? 0);
      return {
        key,
        tag: bucket.tag,
        cls: bucket.cls,
        hint: bucket.hint,
        medianAreaPx,
        count: bucket.values.length,
        lcpP75: lcpStats.p75,
        lcpP95: lcpStats.p95,
      };
    })
    // Drop fingerprints with <3 observations — too noisy to act on.
    .filter((row) => row.count >= 3)
    // Sort by count desc; tie-break by lcpP75 desc so the slow ones
    // float up among the popular ones.
    .sort((a, b) => b.count - a.count || b.lcpP75 - a.lcpP75)
    .slice(0, MAX_LCP_ELEMENTS_RETURNED);

  return {
    byMetric,
    byRoute,
    series,
    lcpElements,
    meta: {
      totalEvents: events.length,
      daysWithData: daysSeen.size,
      daysRequested,
      generatedAt: new Date().toISOString(),
    },
  };
}
