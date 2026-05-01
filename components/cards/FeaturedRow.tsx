"use client";

import { CineLoop } from "../cine";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { getDescription } from "@/lib/case-description";
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
  const cat = CATEGORIES.find((c) => c.id === caso.category);
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
        <CineLoop
          kind={caso.loop}
          aspect={variant === "hero" ? "16/10" : "16/10"}
          speed={0.8}
          showChrome={true}
          media={caso.media}
        />
        <div className="case-thumb-overlay"></div>
        <button
          className={`case-thumb-fav ${isFav ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onFav();
          }}
          aria-label="Favorito"
        >
          {Icon.heart(isFav)}
        </button>
        <span className="case-thumb-modality">{caso.modality}</span>
      </div>
      <div className="featured-meta">
        <div className="case-cat">{cat?.label}</div>
        <h3 className="featured-title">{caso.title}</h3>
        {variant === "hero" && <p className="featured-abstract">{getDescription(caso)}</p>}
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
  const featured = cases.filter((c) => c.featured).slice(0, 3);
  const [hero, ...side] = featured;
  // The early return both skips an empty row and narrows `hero` from
  // `CaseRecord | undefined` to `CaseRecord` for the rest of the JSX.
  if (!hero) return null;
  return (
    <section className="featured-row">
      <div className="featured-head">
        <h2>Destacados</h2>
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
