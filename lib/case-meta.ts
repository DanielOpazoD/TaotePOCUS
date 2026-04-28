/**
 * Editorial helpers for the case modal: reading-time estimate, difficulty
 * label, last-updated formatting. Pure — testable in isolation.
 */

import type { CaseRecord } from "./types";

/** Words per minute used for the estimate. Conservative for a Spanish
 *  reader skimming clinical content with technical terms. */
const WPM = 180;

const DIFFICULTY_LABEL: Record<NonNullable<CaseRecord["difficulty"]>, string> = {
  basic: "Básico",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};

/**
 * Estimate reading time in minutes (rounded up, minimum 1) based on the
 * combined narrative fields. Returned as a localized string ready to
 * paste into the UI.
 */
export function readingTimeFor(c: CaseRecord): string {
  const text = `${c.title} ${c.summary} ${c.findings} ${c.diagnosis} ${c.tags.join(" ")}`;
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / WPM));
  return `${minutes} min`;
}

/** Human-readable difficulty label, with `intermediate` as the default. */
export function difficultyLabel(c: CaseRecord): string {
  return DIFFICULTY_LABEL[c.difficulty ?? "intermediate"];
}

/**
 * Returns the most relevant date for "last update" display:
 * `lastUpdated` if present, falling back to `date`. Always returns a
 * Spanish-localized "21 de abril de 2026" style string.
 */
export function lastUpdatedFor(c: CaseRecord): string {
  const iso = c.lastUpdated || c.date;
  return new Date(iso).toLocaleDateString("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Returns true if the case was updated meaningfully more recently than
 *  it was published. Used to show an "actualizado" stamp in the modal. */
export function wasUpdatedAfterPublication(c: CaseRecord): boolean {
  if (!c.lastUpdated) return false;
  return new Date(c.lastUpdated).getTime() - new Date(c.date).getTime() > 24 * 60 * 60 * 1000;
}
