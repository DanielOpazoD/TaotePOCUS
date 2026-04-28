import type { CaseRecord } from "@/lib/types";

/**
 * Build a sparkline polyline ("x,y x,y …") of monthly case counts
 * over the last `months` calendar months ending on today. The path
 * is normalized to a 60×16 viewBox so the SVG can stretch with CSS.
 *
 * Returns `null` when there's nothing worth drawing (no cases at all,
 * or a flat line at zero — the latter would render as a single dash
 * and read as a glitch).
 *
 * Lives in components/hero/ because it's only used by AtlasHero. If
 * a second consumer ever appears, promote to lib/.
 */
export function buildSparkline(cases: CaseRecord[], months: number): string | null {
  if (cases.length === 0) return null;
  const now = new Date();
  const buckets = new Array<number>(months).fill(0);
  for (const c of cases) {
    const d = parseIsoDate(c.date);
    if (!d) continue;
    const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (monthsAgo >= 0 && monthsAgo < months) {
      const idx = months - 1 - monthsAgo;
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
  }
  const max = Math.max(...buckets, 1);
  if (max === 0) return null;
  const step = months > 1 ? 60 / (months - 1) : 0;
  return buckets
    .map((v, i) => {
      const x = i * step;
      // Invert y because SVG y grows downward; pad 2px top/bottom.
      const y = 14 - (v / max) * 12;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function parseIsoDate(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
