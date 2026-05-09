// Pure derivation of the section header (title / subtitle / breadcrumb).
// Extracted from App.tsx to eliminate three-level ternaries — testable
// in isolation, and adding a new view kind only changes this file plus
// the View union.

import { CATEGORIES, SECTIONS } from "./data";
import { categoryLabel, sectionLabel, sectionSub, translate } from "./i18n";
import { DEFAULT_LANG, type Lang } from "./i18n/types";
import type { View } from "./types";

/**
 * Header copy displayed at the top of the main content. Title is the
 * primary `<h1>`, sub is a one-line description, crumb is the trailing
 * segment of the breadcrumb (the leading "Taote POCUS" segment is
 * fixed in the rendering component).
 */
export interface PageHead {
  /** Primary `<h1>` text. Section name, category name, or fixed copy. */
  title: string;
  /** One-line description rendered under the title. */
  sub: string;
  /** Trailing breadcrumb segment (after the brand). */
  crumb: string;
}

/**
 * Compute the header for the current view + active category. Pure: no
 * dependency on React or DOM. Pin behavior with `tests/headers.test.ts`.
 *
 * Resolution order:
 * 1. Special views (`favs`, `admin`) get fixed copy.
 * 2. Section views with an active category use the category as title,
 *    section as sub.
 * 3. Section views without a category use the section's own label/sub.
 *
 * @param view             The current top-level view (driven by URL).
 * @param activeCat        The active category filter, or `null` if none.
 * @param sectionLabelOverrides
 *   Optional admin-set rename map (`{ atlas: "Atlas pediátrico" }`).
 *   When a key is present its value replaces the default label from
 *   `SECTIONS`. Empty object / omitted → uses defaults. Driven by
 *   `useSectionLabels` on the client; tests + server-render call
 *   without it for default behavior.
 * @param lang
 *   UI language. Defaults to the canonical fallback (Spanish) so
 *   existing callers (server render, focused tests, the sitemap
 *   builder) keep working without modification. The client passes
 *   the live language from `useLanguage`.
 * @returns The page head copy. Always returns valid strings — falls
 *          back to the brand defaults for an unknown section.
 */
export function derivePageHead(
  view: View,
  activeCat: string | null,
  sectionLabelOverrides: Record<string, string> = {},
  lang: Lang = DEFAULT_LANG,
): PageHead {
  if (view.kind === "favs") {
    return {
      title: translate(lang, "page.favs.title"),
      sub: translate(lang, "page.favs.sub"),
      crumb: translate(lang, "page.favs.crumb"),
    };
  }
  if (view.kind === "admin") {
    return {
      title: translate(lang, "page.admin.title"),
      sub: translate(lang, "page.admin.sub"),
      crumb: translate(lang, "page.admin.crumb"),
    };
  }
  // section view
  const section = SECTIONS.find((s) => s.id === view.section);
  // Admin override wins over the dictionary translation: the admin
  // explicitly chose this label, language preference is secondary
  // intent. Falls through to the i18n-aware label otherwise.
  const resolvedSectionLabel = section
    ? (sectionLabelOverrides[section.id] ?? sectionLabel(section.id, lang))
    : null;
  const cat = activeCat ? CATEGORIES.find((c) => c.id === activeCat) : null;
  if (cat && section && resolvedSectionLabel) {
    const localizedCat = categoryLabel(cat, lang);
    return {
      title: localizedCat,
      sub: `${resolvedSectionLabel} · ${localizedCat}`,
      crumb: `${resolvedSectionLabel} · ${translate(lang, "page.crumb.category")}`,
    };
  }
  return {
    title: resolvedSectionLabel || translate(lang, "page.fallback.title"),
    sub: section ? sectionSub(section.id, lang) : translate(lang, "page.fallback.sub"),
    crumb: resolvedSectionLabel || translate(lang, "page.fallback.crumb"),
  };
}
