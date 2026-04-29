// Pure derivation of the section header (title / subtitle / breadcrumb).
// Extracted from App.tsx to eliminate three-level ternaries — testable
// in isolation, and adding a new view kind only changes this file plus
// the View union.

import { CATEGORIES, SECTIONS } from "./data";
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
 * @param view       The current top-level view (driven by URL).
 * @param activeCat  The active category filter, or `null` if none.
 * @returns The page head copy. Always returns valid strings — falls
 *          back to "Taote POCUS" / "Inicio" for an unknown section.
 */
export function derivePageHead(view: View, activeCat: string | null): PageHead {
  if (view.kind === "favs") {
    return {
      title: "Tu colección",
      sub: "Casos que has guardado para revisar más tarde.",
      crumb: "Mi colección",
    };
  }
  if (view.kind === "admin") {
    return {
      title: "Panel de administración",
      sub: "Sube nuevas imágenes, videos o GIFs y gestiona tus publicaciones.",
      crumb: "Admin",
    };
  }
  // section view
  const section = SECTIONS.find((s) => s.id === view.section);
  const cat = activeCat ? CATEGORIES.find((c) => c.id === activeCat) : null;
  if (cat && section) {
    return {
      title: cat.label,
      sub: `${section.label} · ${cat.label}`,
      crumb: `${section.label} · Categoría`,
    };
  }
  return {
    title: section?.label || "Taote POCUS",
    sub: section?.sub || "Casos clínicos contribuidos por la comunidad.",
    crumb: section?.label || "Inicio",
  };
}
