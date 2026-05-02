"use client";

import { CategoryGlyph, CustomCategoryGlyph } from "@/lib/icons";
import type { PageHead } from "@/lib/headers";

interface Props {
  head: PageHead;
  cat: string | null;
}

/**
 * Compact section header. The single header style across every
 * section. Three lines — eyebrow crumb, h1, subtitle — and that's
 * it. The dramatic per-section heros (auroras, sparklines, ECG
 * strips, gradient titles, geometric posters) were removed in
 * May-2026 because they pushed the case grid below the fold; users
 * read this app as a working catalog, not a magazine cover, so the
 * header now sits as quietly as possible to give the grid the
 * vertical space it deserves.
 *
 * The `view-transition-name`s for h1 and crumb live in `main.css`
 * so morphing between section ↔ category pages still pairs the
 * same elements before/after navigation.
 */
export default function CompactHead({ head, cat }: Props) {
  return (
    <div className="section-head">
      <div>
        <div className="crumb">
          <span>Taote POCUS</span>
          <span className="crumb-dot" />
          <span>{head.crumb}</span>
          {cat && (
            <span className="crumb-glyph" aria-hidden="true">
              {CategoryGlyph[cat] ?? CustomCategoryGlyph}
            </span>
          )}
        </div>
        <h1>{head.title}</h1>
        <p>{head.sub}</p>
      </div>
    </div>
  );
}
