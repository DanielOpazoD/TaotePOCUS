"use client";

// Tiny "ES" pill that signals the EN-mode reader they're seeing the
// Spanish baseline because the admin hasn't translated this field
// yet. Mounted next to a case title / summary / tag-row whenever
// `LocalizedRead.isFallback === true`.
//
// Two variants:
//   - default — sits next to the parent text as an inline-block pill,
//     visually balanced against the title's text height.
//   - `inline` — used in flowing body copy (the case-summary blurb)
//     so the badge follows the last word rather than wrapping below
//     a long paragraph.
//
// The label text is the source language code ("ES"); the tooltip
// (`title`) carries the explanatory string from the dictionary so
// keyboard / screen-reader users hear "Translation pending — showing
// the Spanish original" without depending on hover.

import { fallbackBadgeLabel, type LocalizedRead } from "@/lib/case-localized";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  /** The `LocalizedRead` whose fallback state we visualize. */
  read: LocalizedRead;
  /** Render inline (next to body copy) instead of as a header chip. */
  inline?: boolean;
}

export default function FallbackBadge({ read, inline = false }: Props) {
  const { t } = useLanguage();
  if (!read.isFallback) return null;
  const label = fallbackBadgeLabel(read);
  const tooltip = t("case.fallback.title");
  return (
    <span
      className={`fallback-badge${inline ? " fallback-badge--inline" : ""}`}
      title={tooltip}
      aria-label={tooltip}
    >
      {label}
    </span>
  );
}
