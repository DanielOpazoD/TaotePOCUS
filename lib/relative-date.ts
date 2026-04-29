// Pure date formatting helpers. No React, no DOM — usable in any
// surface (cards, modal, admin, server-side render via SEO meta).
//
// We deliberately don't pull in date-fns or dayjs: the rules we need
// are simple and tiny, and avoiding the dependency keeps the bundle
// honest. Spanish only — there's no locale in the URL or the data
// model that would justify a locale parameter today.

export const MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** Format an ISO date as "2 abr" — short month, no year. */
export function shortDayMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${d} ${MONTHS_SHORT[m - 1] ?? ""}`;
}

/**
 * Render a date as "hace 3 días" / "ayer" / "hoy" / "hace 2 semanas",
 * falling back to an absolute "16 abr 2026" for anything older than
 * ~6 weeks. The threshold matches user mental models — recent dates
 * benefit from the warmth of relative phrasing, older ones are
 * easier to anchor with the actual calendar date.
 *
 * Returns "—" for unparseable input rather than throwing — case
 * data ultimately comes from user uploads and we'd rather not crash
 * the card grid for one bad row.
 */
export function relativeDate(iso: string, now: Date = new Date()): string {
  const then = parseLocalIsoDate(iso);
  if (!then) return "—";

  // Normalize to local-day boundaries so a case dated "2026-04-25"
  // reads as "ayer" the next day, not "hace 23 horas". Inputs are
  // parsed as LOCAL dates (not UTC) so a case dated 2026-04-28 is
  // "hoy" everywhere, not just in the UTC timezone.
  const startOfThen = then; // already at local midnight
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((startOfNow.getTime() - startOfThen.getTime()) / 86_400_000);

  if (diffDays < 0) {
    // Future date — uncommon (timezone skew or seed data) but we
    // shouldn't say "hace -3 días". Fall back to absolute.
    return absoluteDate(then);
  }
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "ayer";
  if (diffDays < 7) return `hace ${diffDays} días`;
  if (diffDays < 14) return "hace 1 semana";
  if (diffDays < 28) return `hace ${Math.floor(diffDays / 7)} semanas`;
  if (diffDays < 60) return "hace 1 mes";
  // Anything ~2 months or older: switch to absolute. Avoids stretches
  // like "hace 14 meses" that read as awkward.
  return absoluteDate(then);
}

/**
 * Render an absolute date as "16 abr 2026". Used as the fallback for
 * old dates and as the tooltip companion to relative output.
 *
 * String inputs are parsed as LOCAL dates so they don't drift across
 * timezones. Date inputs are read with their local components.
 */
export function absoluteDate(d: Date | string): string {
  const date = typeof d === "string" ? parseLocalIsoDate(d) : d;
  if (!date || Number.isNaN(date.getTime())) return "—";
  const month = MONTHS_SHORT[date.getMonth()] ?? "";
  return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

/**
 * Parse an ISO date string ("YYYY-MM-DD") as a LOCAL Date at midnight,
 * not as UTC. JS's `new Date("2026-04-28")` treats the string as UTC,
 * which then drifts to "yesterday" or "tomorrow" depending on the
 * user's timezone — exactly the bug we want to avoid for human-facing
 * relative dates. Returns `null` for malformed input.
 */
function parseLocalIsoDate(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
