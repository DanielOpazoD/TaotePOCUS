// Shared percentile + aggregation helpers for RUM metrics. Kept in
// its own module so both the admin API and the unit tests import
// from one place — and so a future export to the dashboard panel
// (no-server-needed re-aggregation) doesn't drag the Blob runtime
// along with it.
//
// Why not use a stats library: the inputs are at most a few
// thousand numbers per dimension, the math is dead simple, and we
// already pay for ~zero deps in this app. Adding a dep for `p50`
// would dilute the dependency story.

/** Compute a percentile from a sorted array using the linear
 *  interpolation method (same as Lighthouse / web-vitals reports).
 *  `p` is 0..100 inclusive. Returns 0 for an empty array — the
 *  consumer is expected to gate on `count > 0` for legible UX. */
export function percentile(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  // Length-checks above guarantee these indices are in-bounds, so
  // the `!` non-null assertions are sound — TS strict's
  // `noUncheckedIndexedAccess` doesn't follow the length narrowing.
  if (n === 1) return sorted[0]!;
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const vLo = sorted[lo]!;
  if (lo === hi) return vLo;
  const vHi = sorted[hi]!;
  const weight = rank - lo;
  return vLo * (1 - weight) + vHi * weight;
}

/** Rounded p50/p75/p95 + count for a numeric series. Sorts in
 *  place (cheap on small arrays). Returns integer ms for time-
 *  based metrics and 4-decimal precision for CLS. */
export interface MetricStats {
  p50: number;
  p75: number;
  p95: number;
  count: number;
}

export function summarize(values: number[], opts: { precision?: number } = {}): MetricStats {
  if (values.length === 0) return { p50: 0, p75: 0, p95: 0, count: 0 };
  values.sort((a, b) => a - b);
  const precision = opts.precision ?? 0;
  const factor = 10 ** precision;
  return {
    p50: Math.round(percentile(values, 50) * factor) / factor,
    p75: Math.round(percentile(values, 75) * factor) / factor,
    p95: Math.round(percentile(values, 95) * factor) / factor,
    count: values.length,
  };
}

/** Metric-name → precision lookup. CLS gets 4 decimals because
 *  the typical range is 0..0.5; everything else is integer ms. */
export function precisionFor(metric: string): number {
  return metric === "cls" ? 4 : 0;
}
