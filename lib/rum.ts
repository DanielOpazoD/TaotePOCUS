// Client-side Real User Monitoring. Subscribes to Google's
// `web-vitals` library, captures the Core Web Vitals as the user
// interacts with the page, and posts each measurement to
// `/api/metrics/report` as a fire-and-forget beacon.
//
// Privacy posture (intentional non-features):
//   - NO IP, NO user-agent string, NO timestamp from the client
//     (the server stamps).
//   - NO session id, NO cookies read.
//   - NO query strings or hash in the route (we send `pathname`
//     only, normalised so admin sub-routes collapse to "/admin").
//   - Honors `navigator.doNotTrack === "1"` and the deprecated
//     `window.doNotTrack` shim — DNT users send zero beacons.
//
// Why `sendBeacon` and not `fetch`:
//   - `sendBeacon` survives the navigation transition (a click that
//     unloads the page can still report the LCP). `fetch` gets
//     aborted by the browser when the page tears down.
//   - It's queued by the browser, not blocking the main thread, so
//     a slow ingest endpoint doesn't slow the user's nav.
//
// The module is import-side-effect free. Call `initRum()` once from
// the layout (we do it from a tiny client component mounted at the
// app shell) and forget.

import {
  onCLS,
  onFCP,
  onINP,
  onLCP,
  onTTFB,
  type CLSMetric,
  type FCPMetric,
  type INPMetric,
  type LCPMetric,
  type TTFBMetric,
} from "web-vitals";

/** Shape posted to /api/metrics/report. Compact field names because
 *  each beacon is ~150 bytes on the wire — every dropped byte counts
 *  when the user is on slow hospital wifi. */
export interface RumBeacon {
  /** Metric name. The web-vitals library emits these in upper case
   *  (e.g. "LCP"); we lower-case before sending so the server side
   *  doesn't have to normalise. */
  n: "lcp" | "inp" | "cls" | "fcp" | "ttfb";
  /** Value in milliseconds for time-based metrics, unitless for CLS. */
  v: number;
  /** Pathname only, normalised. See `normalizeRoute`. */
  r: string;
  /** Viewport bucket. Buckets > exact widths so the aggregation
   *  table is readable AND the field is non-identifying. */
  vp: "mobile" | "tablet" | "desktop";
}

const ENDPOINT = "/api/metrics/report";

/** True when the user opted out of tracking via Do Not Track. */
function doNotTrackEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  // `doNotTrack` returns "1" / "0" as a string in spec; older
  // browsers used `window.doNotTrack` or `navigator.msDoNotTrack`.
  // Treat any truthy "1" as opt-out.
  const navDnt = (navigator as Navigator & { doNotTrack?: string }).doNotTrack;
  const winDnt = (typeof window !== "undefined" ? window : undefined) as
    | (Window & { doNotTrack?: string })
    | undefined;
  return navDnt === "1" || winDnt?.doNotTrack === "1";
}

/** Group pathnames into a small set of stable buckets so the
 *  admin dashboard table has one row per surface, not one row per
 *  case. The catalog uses query params for filters (`?cat=lung`)
 *  and case IDs (`?caso=abc`), which already keep the pathname
 *  stable across casees — so most paths land cleanly. The few
 *  that don't (admin sub-routes) collapse to a single bucket. */
function normalizeRoute(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  // Collapse admin sub-routes ("/admin/anything") to "/admin"
  // so we don't fan out the table with one row per panel.
  if (pathname.startsWith("/admin")) return "/admin";
  // Trim trailing slash for stable matching.
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

/** Bucket the current viewport into mobile / tablet / desktop. The
 *  breakpoints match `app/styles/layout.css` so the dashboard reads
 *  consistently with the visual layout the metrics were captured
 *  under. */
function viewportBucket(): RumBeacon["vp"] {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w < 640) return "mobile";
  if (w < 960) return "tablet";
  return "desktop";
}

/** Fire-and-forget post. Uses `sendBeacon` when available (survives
 *  navigation), falls back to `fetch` with `keepalive: true`. */
function send(beacon: RumBeacon): void {
  if (typeof navigator === "undefined") return;
  const payload = JSON.stringify(beacon);
  // sendBeacon expects a Blob / FormData / string; passing a string
  // sends it as `text/plain` which our endpoint accepts. Returns
  // false if the browser refuses (rare — usually a payload size cap).
  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
    if (ok) return;
  }
  // Fallback for browsers without sendBeacon (very old Safari).
  // `keepalive: true` lets the request outlive the page unload.
  fetch(ENDPOINT, {
    method: "POST",
    body: payload,
    headers: { "content-type": "application/json" },
    keepalive: true,
  }).catch(() => {
    // Best-effort — beacon loss isn't a user-facing failure.
  });
}

/** Round CLS to 4 decimals (the metric is in 0..0.X range) and
 *  everything else to integer milliseconds. Keeps payload size
 *  small + the aggregation arithmetic stable. */
function roundValue(name: RumBeacon["n"], value: number): number {
  if (name === "cls") return Math.round(value * 10_000) / 10_000;
  return Math.round(value);
}

type WebVitalMetric = LCPMetric | INPMetric | CLSMetric | FCPMetric | TTFBMetric;

/** Wrap each web-vitals callback so we shape + send. The library
 *  fires each callback ONCE per page lifecycle for terminal metrics
 *  (LCP / CLS) and on each interaction for INP. */
function handleMetric(metric: WebVitalMetric): void {
  const name = metric.name.toLowerCase() as RumBeacon["n"];
  const beacon: RumBeacon = {
    n: name,
    v: roundValue(name, metric.value),
    r: normalizeRoute(typeof window !== "undefined" ? window.location.pathname : "/"),
    vp: viewportBucket(),
  };
  send(beacon);
}

/** Initialise the RUM client. Safe to call multiple times — the
 *  web-vitals library de-dupes its event listeners per metric.
 *  Returns true when subscriptions were installed, false when
 *  skipped (DNT / SSR). */
export function initRum(): boolean {
  if (typeof window === "undefined") return false;
  if (doNotTrackEnabled()) return false;
  onLCP(handleMetric);
  onINP(handleMetric);
  onCLS(handleMetric);
  onFCP(handleMetric);
  onTTFB(handleMetric);
  return true;
}

// Exported for unit tests — production code path is just initRum().
export const __test = { normalizeRoute, viewportBucket, roundValue, doNotTrackEnabled };
