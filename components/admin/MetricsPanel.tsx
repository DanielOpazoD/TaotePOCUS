"use client";

// Admin-only RUM dashboard. Fetches `/api/admin/metrics`, renders
// three views:
//
//   1. Five Core Web Vitals cards with p50 / p75 / p95 + count.
//      Color-coded against the Google Web Vitals thresholds.
//   2. A 30-day sparkline (one polyline per metric) so the admin
//      can eyeball regressions over time.
//   3. A per-route table — drives the question "which surface is
//      slow?". Routes with <5 events are dropped at the server
//      side so percentiles stay meaningful.
//
// The chart is hand-rolled SVG — no charting library, both to
// keep the bundle tight and because the data shape is small and
// the visual is intentionally minimal (the editorial style of the
// app is restraint, not data-viz showcases).
//
// Empty state: when the store has no events yet (first deploy,
// quiet days, brand-new dev environment), the panel renders an
// onboarding prompt with the SW + endpoint hints so the admin can
// verify wiring without digging through the source.

import { useEffect, useState } from "react";
import { useT } from "@/hooks/useLanguage";

interface MetricStats {
  p50: number;
  p75: number;
  p95: number;
  count: number;
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
  date: string;
  lcpP75: number;
  inpP75: number;
  clsP75: number;
  count: number;
}

/** LCP element fingerprint row. Server-side aggregator
 *  (`lib/metrics-aggregate.ts`) builds these from beacons that
 *  carried the `el` field (added in the LCP-instrumentation pass).
 *  Drives the "what element is actually the LCP?" diagnostic
 *  section of the dashboard. */
interface LcpElementRow {
  key: string;
  tag: string;
  cls?: string;
  hint: string;
  medianAreaPx: number;
  count: number;
  lcpP75: number;
  lcpP95: number;
}

interface MetricsResponse {
  byMetric: ByMetric;
  byRoute: RouteRow[];
  series: SeriesPoint[];
  lcpElements: LcpElementRow[];
  meta: {
    totalEvents: number;
    daysWithData: number;
    daysRequested: number;
    generatedAt: string;
  };
}

type FetchState =
  | { kind: "loading" }
  | { kind: "ok"; data: MetricsResponse }
  | { kind: "error"; message: string };

/** Core Web Vitals thresholds. Numbers come from Google's
 *  documented buckets (web.dev/vitals/). The `unit` field lets us
 *  format display values consistently. */
const THRESHOLDS = {
  lcp: { good: 2500, poor: 4000, unit: "ms" },
  inp: { good: 200, poor: 500, unit: "ms" },
  cls: { good: 0.1, poor: 0.25, unit: "" },
  fcp: { good: 1800, poor: 3000, unit: "ms" },
  ttfb: { good: 800, poor: 1800, unit: "ms" },
} as const;

type MetricKey = keyof typeof THRESHOLDS;

/** Classify a p75 value against the metric's thresholds. Drives
 *  the card's accent color so the admin reads "green / amber / red"
 *  at a glance. */
function classify(metric: MetricKey, value: number): "good" | "ni" | "poor" | "empty" {
  if (value <= 0) return "empty";
  const t = THRESHOLDS[metric];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "ni"; // "needs improvement"
  return "poor";
}

/** Format a metric value for display. CLS gets fixed-3 decimals,
 *  everything else gets integer ms with a thousands separator. */
function formatValue(metric: MetricKey, value: number): string {
  if (metric === "cls") return value.toFixed(3);
  if (value === 0) return "—";
  return `${value.toLocaleString()} ms`;
}

export function MetricsPanel() {
  const t = useT();
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/admin/metrics?days=${days}`);
        if (!res.ok) {
          if (!cancelled) setState({ kind: "error", message: `HTTP ${res.status}` });
          return;
        }
        const data = (await res.json()) as MetricsResponse;
        if (!cancelled) setState({ kind: "ok", data });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (state.kind === "loading") {
    return (
      <div className="metrics-panel metrics-panel--loading" role="status">
        <p>{t("metrics.loading")}</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="metrics-panel metrics-panel--error" role="alert">
        <p>
          {t("metrics.errorPrefix")}: {state.message}
        </p>
      </div>
    );
  }

  const { byMetric, byRoute, series, lcpElements, meta } = state.data;
  const hasData = meta.totalEvents > 0;

  return (
    <div className="metrics-panel">
      <header className="metrics-panel-head">
        <div>
          <h3>{t("metrics.title")}</h3>
          <p className="metrics-panel-sub">
            {hasData
              ? t("metrics.summary", {
                  total: meta.totalEvents.toLocaleString(),
                  days: meta.daysWithData,
                })
              : t("metrics.empty.sub")}
          </p>
        </div>
        <div className="metrics-window-picker" role="group" aria-label={t("metrics.window.aria")}>
          {[7, 30, 90].map((n) => (
            <button
              key={n}
              type="button"
              className={"metrics-window-btn" + (days === n ? " is-active" : "")}
              onClick={() => setDays(n)}
              aria-pressed={days === n}
            >
              {t("metrics.window.days", { n })}
            </button>
          ))}
        </div>
      </header>

      {!hasData ? (
        <div className="metrics-empty">
          {/* Onboarding rather than a generic "no data" box. Three
              actionable checks an admin can run when the dashboard
              is blank: SW is active, beacon endpoint replies 204,
              and the user has DNT off. */}
          <h4>{t("metrics.empty.title")}</h4>
          <ul>
            <li>{t("metrics.empty.checkA")}</li>
            <li>{t("metrics.empty.checkB")}</li>
            <li>{t("metrics.empty.checkC")}</li>
          </ul>
        </div>
      ) : (
        <>
          {/* Five metric cards. Grid wraps responsively; each card
              is self-contained so the admin can scan top-to-bottom
              or pick one to drill into. The p75 is the headline
              number because that's the threshold Google uses for
              its "good / needs improvement / poor" bucket. */}
          <div className="metrics-cards">
            {(Object.keys(THRESHOLDS) as MetricKey[]).map((k) => {
              const stats = byMetric[k];
              const status = classify(k, stats.p75);
              return (
                <div key={k} className={`metric-card metric-card--${status}`}>
                  <div className="metric-card-head">
                    <span className="metric-card-name">{k.toUpperCase()}</span>
                    <span className="metric-card-count">
                      {t("metrics.card.count", { n: stats.count })}
                    </span>
                  </div>
                  <div className="metric-card-headline">{formatValue(k, stats.p75)}</div>
                  <div className="metric-card-percentiles">
                    <span>p50 {formatValue(k, stats.p50)}</span>
                    <span>p95 {formatValue(k, stats.p95)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {series.length > 1 && (
            <div className="metrics-series">
              <h4>{t("metrics.series.title")}</h4>
              <Sparkline series={series} metric="lcpP75" ariaLabel={t("metrics.series.aria.lcp")} />
              <Sparkline series={series} metric="inpP75" ariaLabel={t("metrics.series.aria.inp")} />
              <Sparkline series={series} metric="clsP75" ariaLabel={t("metrics.series.aria.cls")} />
            </div>
          )}

          {byRoute.length > 0 && (
            <div className="metrics-routes">
              <h4>{t("metrics.routes.title")}</h4>
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>{t("metrics.routes.col.route")}</th>
                    <th>LCP p75</th>
                    <th>INP p75</th>
                    <th>CLS p75</th>
                    <th>{t("metrics.routes.col.count")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byRoute.map((row) => (
                    <tr key={row.route}>
                      <td className="metrics-table-route">{row.route}</td>
                      <td
                        className={`metrics-table-cell metrics-table-cell--${classify("lcp", row.lcpP75)}`}
                      >
                        {formatValue("lcp", row.lcpP75)}
                      </td>
                      <td
                        className={`metrics-table-cell metrics-table-cell--${classify("inp", row.inpP75)}`}
                      >
                        {formatValue("inp", row.inpP75)}
                      </td>
                      <td
                        className={`metrics-table-cell metrics-table-cell--${classify("cls", row.clsP75)}`}
                      >
                        {formatValue("cls", row.clsP75)}
                      </td>
                      <td>{row.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* LCP element fingerprint table — the diagnostic surface
              that answers "what element is the LCP actually?". Only
              renders when there's data (older clients predate the
              instrumentation pass). Sorted by observation count;
              status color from p75 against the LCP thresholds. */}
          {lcpElements.length > 0 && (
            <div className="metrics-routes">
              <h4>{t("metrics.lcpElements.title")}</h4>
              <p className="metrics-section-sub">{t("metrics.lcpElements.sub")}</p>
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>{t("metrics.lcpElements.col.element")}</th>
                    <th>{t("metrics.lcpElements.col.area")}</th>
                    <th>LCP p75</th>
                    <th>LCP p95</th>
                    <th>{t("metrics.routes.col.count")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lcpElements.map((row) => (
                    <tr key={row.key}>
                      <td className="metrics-table-route">
                        <strong>{row.tag}</strong>
                        {row.cls && <span className="metrics-lcp-cls">.{row.cls}</span>}
                        {row.hint && (
                          <span className="metrics-lcp-hint" title={row.hint}>
                            {row.hint}
                          </span>
                        )}
                      </td>
                      <td>
                        {row.medianAreaPx > 0
                          ? `${Math.round(Math.sqrt(row.medianAreaPx))}²px`
                          : "—"}
                      </td>
                      <td
                        className={`metrics-table-cell metrics-table-cell--${classify("lcp", row.lcpP75)}`}
                      >
                        {formatValue("lcp", row.lcpP75)}
                      </td>
                      <td
                        className={`metrics-table-cell metrics-table-cell--${classify("lcp", row.lcpP95)}`}
                      >
                        {formatValue("lcp", row.lcpP95)}
                      </td>
                      <td>{row.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <footer className="metrics-panel-foot">
        <small>{t("metrics.foot.privacy")}</small>
        <small>
          {t("metrics.foot.generated", {
            time: new Date(meta.generatedAt).toLocaleTimeString(),
          })}
        </small>
      </footer>
    </div>
  );
}

/** Tiny inline-SVG sparkline. Takes the series + the field to plot.
 *  Sizing is fluid: 600×40 viewBox, the wrapper CSS scales the SVG
 *  to fit the panel width. Empty / single-point series fall back
 *  to nothing visible (the caller already gates on `series.length
 *  > 1`). */
function Sparkline({
  series,
  metric,
  ariaLabel,
}: {
  series: SeriesPoint[];
  metric: "lcpP75" | "inpP75" | "clsP75";
  ariaLabel: string;
}) {
  const values = series.map((p) => p[metric]).filter((v) => v > 0);
  if (values.length < 2) {
    return (
      <div className="metrics-sparkline metrics-sparkline--empty" aria-hidden="true">
        <span>{metric.toUpperCase().replace("P75", " p75")}</span>
        <span className="metrics-sparkline-flat">—</span>
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 600;
  const H = 40;
  // Map each point to (x, y) in viewBox coordinates. Y is inverted
  // so larger metric values draw HIGHER on the chart (intuitive
  // "spike = bad" reading).
  const points = series.map((p, i) => {
    const x = (i / (series.length - 1)) * W;
    const v = p[metric] || min;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  // `series.length >= 2` from the gate above; the non-null asserts
  // satisfy TS's noUncheckedIndexedAccess without runtime cost.
  const last = series[series.length - 1]![metric];
  const first = series[0]![metric];
  const trend = last > first * 1.1 ? "up" : last < first * 0.9 ? "down" : "flat";
  return (
    <div className={`metrics-sparkline metrics-sparkline--${trend}`}>
      <span className="metrics-sparkline-label">{metric.toUpperCase().replace("P75", " p75")}</span>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        className="metrics-sparkline-svg"
      >
        <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span className="metrics-sparkline-current">
        {metric === "clsP75" ? last.toFixed(3) : `${Math.round(last)} ms`}
      </span>
    </div>
  );
}
