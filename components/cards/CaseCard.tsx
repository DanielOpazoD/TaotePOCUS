"use client";

import { useState } from "react";
import { CineLoop } from "../cine";
import { Icon, CategoryGlyph } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { absoluteDate, relativeDate } from "@/lib/relative-date";
import type { CaseRecord } from "@/lib/types";

interface Props {
  caso: CaseRecord;
  isFav: boolean;
  onFav: () => void;
  onOpen: () => void;
}

export default function CaseCard({ caso, isFav, onFav, onOpen }: Props) {
  const cat = CATEGORIES.find((c) => c.id === caso.category);
  const isCrit = caso.tags.includes("Crítico");
  const [bursting, setBursting] = useState(false);
  // Relative date as the visible label, absolute date as the tooltip
  // hover. Older publications fall back to absolute automatically —
  // see lib/relative-date.ts for the rules.
  const dateLabel = relativeDate(caso.date);
  const dateAbsolute = absoluteDate(caso.date);

  const onFavClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Visual reward asymmetric: only animate on becoming-a-fav, not
    // on un-fav. Subtler that way.
    if (!isFav) {
      setBursting(true);
      setTimeout(() => setBursting(false), 600);
    }
    onFav();
  };
  return (
    <div
      className="case-card"
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
      <div className="case-thumb">
        <CineLoop kind={caso.loop} aspect="1/1" speed={0.8} showChrome={true} media={caso.media} />
        <div className="case-thumb-overlay"></div>
        <div className="case-thumb-preview">
          <p>{caso.findings.split(/\.\s+/)[0]}.</p>
        </div>
        {isCrit && <span className="case-thumb-crit">Crítico</span>}
        <button
          className={`case-thumb-fav${isFav ? " active" : ""}${bursting ? " is-bursting" : ""}`}
          onClick={onFavClick}
          aria-label="Favorito"
          aria-pressed={isFav}
        >
          {Icon.heart(isFav)}
        </button>
        <span className="case-thumb-modality">{caso.modality}</span>
      </div>
      <div className="case-meta">
        <div className="case-cat">
          <span className="case-cat-glyph" aria-hidden="true">
            {CategoryGlyph[caso.category] ?? null}
          </span>
          <span>{cat?.label}</span>
        </div>
        <h3 className="case-title">{caso.title}</h3>
        <p className="case-summary">{caso.summary}</p>
        <div className="case-byline">
          <span>{caso.author}</span>
          <span className="dot"></span>
          <time dateTime={caso.date} title={dateAbsolute}>
            {dateLabel}
          </time>
        </div>
        <div className="case-tags">
          {caso.tags.slice(0, 3).map((t) => (
            <span key={t} className="case-tag-mini">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
