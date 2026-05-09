"use client";

import { CineLoop } from "../cine";
import FallbackBadge from "./FallbackBadge";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { getCaseDescription, getCaseTitle } from "@/lib/case-localized";
import { categoryLabel } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import type { CaseRecord } from "@/lib/types";

interface Props {
  cases: CaseRecord[];
  favs: string[];
  onOpen: (c: CaseRecord) => void;
  onFav: (id: string) => void;
}

function FeaturedCard({
  caso,
  variant,
  isFav,
  onOpen,
  onFav,
}: {
  caso: CaseRecord;
  variant: "hero" | "side";
  isFav: boolean;
  onOpen: () => void;
  onFav: () => void;
}) {
  const { lang, t } = useLanguage();
  const cat = CATEGORIES.find((c) => c.id === caso.category);
  const titleRead = getCaseTitle(caso, lang);
  const descRead = getCaseDescription(caso, lang);
  // The "Crítico" red badge was removed in May-2026 — see CaseCard.tsx
  // for the rationale.
  return (
    <div
      className={`featured-card featured-${variant}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="featured-thumb">
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
          {titleRead.value}
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
    </div>
  );
}

export default function FeaturedRow({ cases, favs, onOpen, onFav }: Props) {
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
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
