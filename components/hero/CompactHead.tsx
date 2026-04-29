"use client";

import { CategoryGlyph } from "@/lib/icons";
import type { PageHead } from "@/lib/headers";

interface Props {
  head: PageHead;
  cat: string | null;
}

/**
 * Compact hero fallback. Used by favs / admin / category-narrowed
 * views — anywhere the dramatic section-specific decoration would be
 * misleading. Carries the same `view-transition-name` as the full
 * heros (in CSS) so navigating between hero ↔ compact morphs cleanly.
 */
export default function CompactHead({ head, cat }: Props) {
  return (
    <div className="section-head section-head--compact">
      <div>
        <div className="crumb">
          <span>Taote POCUS</span>
          <span className="crumb-dot" />
          <span>{head.crumb}</span>
          {cat && (
            <span className="crumb-glyph" aria-hidden="true">
              {CategoryGlyph[cat] ?? null}
            </span>
          )}
        </div>
        <h1>{head.title}</h1>
        <p>{head.sub}</p>
      </div>
    </div>
  );
}
