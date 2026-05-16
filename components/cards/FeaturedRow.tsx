"use client";

import { useCallback } from "react";
import { CineLoop } from "../cine";
import FallbackBadge from "./FallbackBadge";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { getCaseDescription, getCaseTitle } from "@/lib/case-localized";
import { categoryLabel } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import { useHoverPrefetch } from "@/hooks/useHoverPrefetch";
import { caseThumbViewTransitionName } from "@/lib/view-transition";
import type { CaseRecord } from "@/lib/types";

interface Props {
  cases: CaseRecord[];
  favs: string[];
  onOpen: (c: CaseRecord) => void;
  onFav: (id: string) => void;
  /** Currently-open case id from URL state. Mirrors the
   *  `<MainGrid>` prop — see `CaseCard.tsx > isViewTransitionTarget`
   *  for the duplicate-name rationale. `null` when no modal open. */
  openCaseId?: string | null;
}

function FeaturedCard({
  caso,
  variant,
  isFav,
  onOpen,
  onFav,
  isViewTransitionTarget = false,
}: {
  caso: CaseRecord;
  variant: "hero" | "side";
  isFav: boolean;
  onOpen: () => void;
  onFav: () => void;
  /** See `<CaseCard>` — suppress `view-transition-name` when the
   *  case is the currently-open one to avoid a duplicate. */
  isViewTransitionTarget?: boolean;
}) {
  const { lang, t } = useLanguage();
  // Hover-prefetch the case media so a click on the featured tile
  // opens the modal with the cine-loop already cached. See
  // `hooks/useHoverPrefetch` for the timing rationale.
  const prefetch = useHoverPrefetch(caso.media);
  const cat = CATEGORIES.find((c) => c.id === caso.category);
  const titleRead = getCaseTitle(caso, lang);
  const descRead = getCaseDescription(caso, lang);
  // The "Crítico" red badge was removed in May-2026 — see CaseCard.tsx
  // for the rationale.
  const handleAnchorClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Same anchor-cover handler as CaseCard — modifier-key clicks
      // fall through to native anchor behavior (open in new tab),
      // unmodified left-click opens the in-page modal. See
      // CaseCard.tsx for the full rationale.
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      e.preventDefault();
      onOpen();
    },
    [onOpen],
  );
  const handleAnchorKey = useCallback(
    (e: React.KeyboardEvent<HTMLAnchorElement>) => {
      // Re-bind Space to mirror the prior `<div role="button">`
      // (anchors only activate on Enter natively).
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        onOpen();
      }
    },
    [onOpen],
  );
  return (
    // Anchor-cover pattern (May-2026): `<article>` semantic wrapper +
    // real `<a>` inside the title for the open-case action. Same
    // shape as `CaseCard`, so the same `.case-card-link` CSS rules
    // give the title link's `::after` pseudo-element the full-card
    // click coverage. The fav button (z-index: 3) sits above the
    // cover. Eliminates the prior `nested-interactive` violation.
    <article
      className={`featured-card featured-${variant}`}
      onPointerEnter={prefetch.onPointerEnter}
      onPointerLeave={prefetch.onPointerLeave}
    >
      <div
        className="featured-thumb"
        // Same view-transition target as `<CaseCard>`. Featured row
        // cases share the morph-into-modal animation.
        style={{
          viewTransitionName: isViewTransitionTarget
            ? "none"
            : caseThumbViewTransitionName(caso.id),
        }}
      >
        {/* Hero is the largest above-the-fold image on sections that
            mount FeaturedRow (ECG, Casos clínicos), so it's the LCP
            candidate. `priority` boosts its fetch priority and disables
            lazy loading. The two side cards stay default-priority. */}
        <CineLoop
          kind={caso.loop}
          aspect={variant === "hero" ? "16/10" : "16/10"}
          speed={0.8}
          showChrome={true}
          media={caso.media}
          priority={variant === "hero"}
        />
        <div className="case-thumb-overlay"></div>
        <button
          className={`case-thumb-fav ${isFav ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onFav();
          }}
          aria-label={t("card.fav.aria")}
        >
          {Icon.heart(isFav)}
        </button>
        <span className="case-thumb-modality">{caso.modality}</span>
      </div>
      <div className="featured-meta">
        <div className="case-cat">{cat ? categoryLabel(cat, lang) : ""}</div>
        {/* h2 (not h3) — same heading-order discipline as `CaseCard`.
            The page ships only h1 chrome, so cards must be h2. */}
        <h2 className="featured-title">
          <a
            href={`?caso=${encodeURIComponent(caso.id)}`}
            className="case-card-link"
            onClick={handleAnchorClick}
            onKeyDown={handleAnchorKey}
          >
            {titleRead.value}
          </a>
          {titleRead.isFallback && <FallbackBadge read={titleRead} />}
        </h2>
        {variant === "hero" && (
          <p className="featured-abstract">
            {descRead.value}
            {descRead.isFallback && <FallbackBadge read={descRead} inline />}
          </p>
        )}
        <div className="case-byline">
          <span>{caso.author}</span>
          <span className="dot"></span>
          <span>{caso.role}</span>
        </div>
      </div>
    </article>
  );
}

export default function FeaturedRow({ cases, favs, onOpen, onFav, openCaseId }: Props) {
  const { t } = useLanguage();
  const featured = cases.filter((c) => c.featured).slice(0, 3);
  const [hero, ...side] = featured;
  // The early return both skips an empty row and narrows `hero` from
  // `CaseRecord | undefined` to `CaseRecord` for the rest of the JSX.
  if (!hero) return null;
  return (
    <section className="featured-row">
      <div className="featured-head">
        <h2>{t("featured.title")}</h2>
        <span className="featured-rule" />
      </div>
      <div className={`featured-grid ${side.length === 0 ? "single" : ""}`}>
        <FeaturedCard
          caso={hero}
          variant="hero"
          isFav={favs.includes(hero.id)}
          onOpen={() => onOpen(hero)}
          onFav={() => onFav(hero.id)}
          isViewTransitionTarget={openCaseId === hero.id}
        />
        {side.length > 0 && (
          <div className="featured-side-stack">
            {side.map((c) => (
              <FeaturedCard
                key={c.id}
                caso={c}
                variant="side"
                isFav={favs.includes(c.id)}
                onOpen={() => onOpen(c)}
                onFav={() => onFav(c.id)}
                isViewTransitionTarget={openCaseId === c.id}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
