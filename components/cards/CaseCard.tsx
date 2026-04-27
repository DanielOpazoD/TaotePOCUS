"use client";

import { CineLoop } from "../cine";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
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
  const dateStr = new Date(caso.date).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
      <div className="case-meta">
        <div className="case-cat">{cat?.label}</div>
        <h3 className="case-title">{caso.title}</h3>
        <p className="case-summary">{caso.summary}</p>
        <div className="case-byline">
          <span>{caso.author}</span>
          <span className="dot"></span>
          <span>{dateStr}</span>
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
