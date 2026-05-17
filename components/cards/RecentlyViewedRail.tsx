"use client";

// Horizontal scroll rail of recently-viewed cases. Shown on
// /favoritos above the main grid so a reader who hasn't favorited
// anything yet still has a "continue where I left off" thread.
//
// Why not a card grid: the rail is meant to be a thin discoverability
// strip, not a primary surface. A grid would compete with the
// favorites grid below it. The horizontal scroll keeps a small
// vertical footprint and signals "auxiliary, swipe to see more."
//
// Each row is a compact tile (thumb + title only) — same shape as
// the editorial featured cards, smaller. Click → standard
// `onOpen(caso)` → modal opens via plain CSS entrance (PR #79
// ripped out the View Transitions morph — see
// `lib/view-transition.ts` header).

import { useCallback } from "react";
import { CineLoop } from "../cine";
import { getCaseTitle } from "@/lib/case-localized";
import { useLanguage } from "@/hooks/useLanguage";
import type { CaseRecord } from "@/lib/types";

interface Props {
  /** Cases to render, most-recent first. Resolved upstream from the
   *  `useRecentlyViewed` hook. Empty → component renders nothing. */
  cases: CaseRecord[];
  /** Open a case in the modal. Same contract as the grid's
   *  `onCardOpen` — `pushPatch({ caso: id })`, plain state change. */
  onOpen: (caso: CaseRecord) => void;
}

export default function RecentlyViewedRail({ cases, onOpen }: Props) {
  const { t } = useLanguage();
  if (cases.length === 0) return null;
  return (
    <section className="recently-viewed" aria-label={t("recently.label")}>
      <header className="recently-head">
        <h2>{t("recently.title")}</h2>
        <span className="recently-rule" />
      </header>
      <ul className="recently-row">
        {cases.map((caso) => (
          <RecentlyViewedItem key={caso.id} caso={caso} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

function RecentlyViewedItem({
  caso,
  onOpen,
}: {
  caso: CaseRecord;
  onOpen: (caso: CaseRecord) => void;
}) {
  const { lang } = useLanguage();
  const titleRead = getCaseTitle(caso, lang);
  // Same anchor-cover pattern the catalog cards use — modifier
  // clicks fall through to native anchor behavior so "open in new
  // tab" still works, unmodified left-click opens the in-page modal.
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
    <li className="recently-item">
      <a
        href={`?caso=${encodeURIComponent(caso.id)}`}
        className="recently-link"
        onClick={handleClick}
      >
        <div className="recently-thumb">
          <CineLoop
            kind={caso.loop}
            aspect="16/10"
            speed={0.8}
            showChrome={false}
            media={caso.media}
          />
        </div>
        <span className="recently-title">{titleRead.value}</span>
      </a>
    </li>
  );
}
