"use client";

// Bottom-of-modal rail of editorially-related cases. Pure presentation
// over the list `findRelatedCases` produced upstream — the scoring
// lives in `lib/related-cases.ts` so server paths (sitemap, JSON-LD
// enrichment) can consume the same ranking without React.
//
// Renders nothing when the list is empty (early days / very small
// catalogs / a brand-new category with no neighbors). That decision
// lives in the parent — we just iterate.

import { useCallback } from "react";
import FallbackBadge from "../cards/FallbackBadge";
import { CATEGORIES } from "@/lib/data";
import { getCaseTitle } from "@/lib/case-localized";
import { categoryLabel } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import type { CaseRecord } from "@/lib/types";

interface Props {
  cases: CaseRecord[];
  /** Open one of the related cases. Wired to `useCardCallbacks.onCardOpen`
   *  in `App.tsx` so the click path is the same as the grid: pushPatch
   *  caso + view-transition crossfade between modal contents. */
  onOpen: (c: CaseRecord) => void;
}

export default function RelatedCases({ cases, onOpen }: Props) {
  const { lang, t } = useLanguage();
  if (cases.length === 0) return null;
  return (
    <div className="modal-section modal-related">
      <h5>{t("modal.section.related")}</h5>
      <ul className="modal-related-list">
        {cases.map((c) => (
          <RelatedItem key={c.id} caso={c} lang={lang} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}

function RelatedItem({
  caso,
  lang,
  onOpen,
}: {
  caso: CaseRecord;
  lang: "es" | "en";
  onOpen: (c: CaseRecord) => void;
}) {
  // Same anchor-cover pattern as CaseCard: real anchor with the deep
  // link as `href` (modifier-click opens in a new tab natively) and
  // an `onClick` that prevents the default and calls `onOpen` for
  // the in-page modal swap. Keeps SEO/sharing intact while letting
  // unmodified clicks animate through the View Transitions wrapper.
  const cat = CATEGORIES.find((x) => x.id === caso.category);
  const titleRead = getCaseTitle(caso, lang);
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      e.preventDefault();
      onOpen(caso);
    },
    [caso, onOpen],
  );
  return (
    <li className="modal-related-item">
      <a
        href={`?caso=${encodeURIComponent(caso.id)}`}
        className="modal-related-link"
        onClick={handleClick}
      >
        <span className="modal-related-title">
          {titleRead.value}
          {titleRead.isFallback && <FallbackBadge read={titleRead} />}
        </span>
        {cat && <span className="modal-related-cat">{categoryLabel(cat, lang)}</span>}
      </a>
    </li>
  );
}
