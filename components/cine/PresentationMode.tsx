"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CineLoop from "./CineLoop";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
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
  const [revealed, setRevealed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const caso = cases[idx];

  const prev = useCallback(() => {
    setIdx((i) => (i - 1 + cases.length) % cases.length);
    setRevealed(false);
  }, [cases.length]);
  const next = useCallback(() => {
    setIdx((i) => (i + 1) % cases.length);
    setRevealed(false);
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
      else if (e.key === "r" || e.key === "R") setRevealed((r) => !r);
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
        <p className="presentation-findings">{caso.findings}</p>
        {revealed ? (
          <div className="presentation-diagnosis">
            <span className="label">Diagnóstico</span>
            <p>{caso.diagnosis}</p>
          </div>
        ) : (
          <button className="presentation-reveal" onClick={() => setRevealed(true)}>
            Revelar diagnóstico (R)
          </button>
        )}
      </div>

      <div className="presentation-help">
        <kbd>←</kbd>/<kbd>→</kbd> navegar &nbsp;·&nbsp; <kbd>P</kbd> pausa &nbsp;·&nbsp;{" "}
        <kbd>R</kbd> revelar &nbsp;·&nbsp; <kbd>Esc</kbd> salir
      </div>
    </div>
  );
}
