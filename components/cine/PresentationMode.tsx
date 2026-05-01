"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CineLoop from "./CineLoop";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { getDescription } from "@/lib/case-description";
import type { CaseRecord } from "@/lib/types";

interface Props {
  cases: CaseRecord[];
  startId: string;
  onClose: () => void;
}

export default function PresentationMode({ cases, startId, onClose }: Props) {
  const startIdx = Math.max(
    0,
    cases.findIndex((c) => c.id === startId),
  );
  const [idx, setIdx] = useState(startIdx);
  const [paused, setPaused] = useState(false);
  // The diagnosis-reveal state (`revealed` + R-key handler) was
  // removed in May-2026 along with the separate `diagnosis` field.
  // See `presentation-findings` block below.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const caso = cases[idx];

  const prev = useCallback(() => {
    setIdx((i) => (i - 1 + cases.length) % cases.length);
  }, [cases.length]);
  const next = useCallback(() => {
    setIdx((i) => (i + 1) % cases.length);
  }, [cases.length]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const el = containerRef.current;
    if (el && el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "p" || e.key === "P") setPaused((p) => !p);
      // The R key used to toggle a diagnosis reveal — gone with
      // ADR-0010. P (pause) is the only single-letter shortcut now.
    };
    window.addEventListener("keydown", onKey);

    const onFsChange = () => {
      if (!document.fullscreenElement) onClose();
    };
    document.addEventListener("fullscreenchange", onFsChange);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.body.style.overflow = "";
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [next, prev, onClose]);

  if (!caso) return null;
  const cat = CATEGORIES.find((c) => c.id === caso.category);

  return (
    <div className="presentation" ref={containerRef}>
      <div className="presentation-header">
        <div className="presentation-counter">
          <span className="num">{(idx + 1).toString().padStart(2, "0")}</span>
          <span className="sep">/</span>
          <span className="total">{cases.length.toString().padStart(2, "0")}</span>
          <span className="sep">·</span>
          <span className="cat">{cat?.label}</span>
        </div>
        <button className="presentation-exit" onClick={onClose} aria-label="Salir (Esc)">
          {Icon.close()} <span>Salir</span>
        </button>
      </div>

      <div className="presentation-stage">
        <button className="presentation-nav left" onClick={prev} aria-label="Anterior (←)">
          {Icon.arrowLeft()}
        </button>

        <div className="presentation-loop">
          <CineLoop
            kind={caso.loop}
            aspect="16/10"
            speed={1}
            paused={paused}
            showChrome={true}
            media={caso.media}
            quality="full"
          />
        </div>

        <button className="presentation-nav right" onClick={next} aria-label="Siguiente (→)">
          {Icon.arrowRight()}
        </button>
      </div>

      <div className="presentation-meta">
        <h1>{caso.title}</h1>
        {/* Body uses the canonical description; legacy `findings` is
            covered by the fallback chain inside `getDescription`. */}
        <p className="presentation-findings">{getDescription(caso)}</p>
        {/* The "reveal diagnosis" pedagogical mechanic was removed in
            May-2026 (ADR-0010): with the trio collapsed into a single
            `description`, there's no separate diagnosis line to
            reveal. The button + state are gone. Future work may
            reintroduce a "spoiler" toggle that splits the description
            on a configurable marker — out of scope for the migration. */}
      </div>

      <div className="presentation-help">
        <kbd>←</kbd>/<kbd>→</kbd> navegar &nbsp;·&nbsp; <kbd>P</kbd> pausa &nbsp;·&nbsp;{" "}
        <kbd>Esc</kbd> salir
      </div>
    </div>
  );
}
