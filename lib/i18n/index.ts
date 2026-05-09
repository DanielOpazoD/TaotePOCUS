// Public surface for the i18n module. Consumers should import from
// `@/lib/i18n` rather than reaching into the dictionary files —
// keeps the dependency graph centralised on the barrel.
//
// Three things live here:
//   1. Re-exports of the type primitives (`Lang`, `DictKey`, …) and
//      the resolved dictionary lookup `DICTS`.
//   2. The interpolation helper that powers `t()` in the React
//      provider — broken out so unit tests can exercise it without
//      mounting React.
//   3. Locale-aware formatters (`formatDate`, `formatRelativeDate`)
//      used by the footer and any future dated surface.
//
// No React imports here on purpose — the file is consumable from
// server components, tests and node scripts (e.g. the seed-cases
// generator) that don't need the React provider.

import { DICT_ES, type Dict, type DictKey } from "./dict.es";
import { DICT_EN } from "./dict.en";
import { type Lang, localeOf } from "./types";

export { LANGS, DEFAULT_LANG, isLang, detectBrowserLang, localeOf } from "./types";
export type { Lang } from "./types";
export type { DictKey, Dict } from "./dict.es";

/** Resolve a dictionary by language. The returned object has every
 *  `DictKey` mapped — so callers can index without a fallback. */
export const DICTS: Record<Lang, Dict> = {
  es: DICT_ES,
  en: DICT_EN,
};

/**
 * Substitute `{name}` placeholders in a translated string with the
 * values from `vars`. Pure — no React, no DOM, suitable for unit
 * tests and server-side rendering.
 *
 * Unknown placeholders pass through untouched (so a typo shows up
 * literally in the UI rather than disappearing). Missing values
 * are coerced to empty string.
 */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

/**
 * Look up a translation key in a specific language and apply any
 * variable substitution. Used by the React provider's `t()` and
 * by tests that need the pure resolver without a Provider mount.
 */
export function translate(
  lang: Lang,
  key: DictKey,
  vars?: Record<string, string | number>,
): string {
  return interpolate(DICTS[lang][key], vars);
}

/**
 * Locale-aware short date. Used by the footer's "Actualizado …"
 * line and anywhere we need a compact date in chrome. Falls back
 * to an em-dash on invalid input rather than throwing.
 *
 * Output shape:
 *   - es-CL → "8 may 2026"
 *   - en-US → "May 8, 2026"
 */
export function formatDate(input: string | Date | undefined, lang: Lang): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(localeOf(lang), {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    // Extremely defensive: Intl is in every browser we support, but
    // a custom test environment could omit it. Plain ISO is better
    // than a thrown error.
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Locale-aware date+time. Used by admin tables (Papelera "Eliminado"
 * column) so the timestamp matches the UI language.
 *
 * Output shape:
 *   - es-CL → "8 may 2026, 14:32"
 *   - en-US → "May 8, 2026, 2:32 PM"
 */
export function formatDateTime(input: string | Date | undefined, lang: Lang): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return typeof input === "string" ? input : "";
  try {
    return new Intl.DateTimeFormat(localeOf(lang), {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Resolve a section id to its localized label. Used by Header /
 * Drawer / Sidebar. Built-in sections have dedicated dict keys; if
 * an unknown id sneaks in (defensive — section ids are typed) we
 * fall back to the literal id rather than a thrown lookup error.
 */
export function sectionLabel(sectionId: string, lang: Lang): string {
  const key = `section.${sectionId}` as DictKey;
  return DICTS[lang][key] ?? sectionId;
}

/** Counterpart for the section description (used by SectionHero). */
export function sectionSub(sectionId: string, lang: Lang): string {
  const key = `section.${sectionId}.sub` as DictKey;
  return DICTS[lang][key] ?? "";
}

/**
 * Resolve a category label by id. Built-in categories get their
 * dictionary translation; **custom** categories (admin-created)
 * fall back to the original `label` field — those will get dual
 * labels in Phase 3 of the i18n rollout.
 */
export function categoryLabel(category: { id: string; label: string }, lang: Lang): string {
  const key = `category.${category.id}` as DictKey;
  const fromDict = DICTS[lang][key];
  return fromDict ?? category.label;
}
