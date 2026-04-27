"use client";

import { useEffect, useState } from "react";
import { CineLoop } from "../cine";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { CaseRecord } from "@/lib/types";

interface Props {
  caso: CaseRecord;
  onClose: () => void;
  isFav: boolean;
  onFav: () => void;
  onShare: () => void;
  onPresent: () => void;
}

export default function CaseModal({ caso, onClose, isFav, onFav, onShare, onPresent }: Props) {
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const cat = CATEGORIES.find((c) => c.id === caso.category);
  const dateStr = new Date(caso.date).toLocaleDateString("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const parts = caso.author.split(/\s+/);
  const initials = (parts.slice(-1)[0]?.[0] || "") + (parts[1]?.[0] || "");

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="case-modal-title"
      aria-describedby="case-modal-summary"
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative" }}
        ref={trapRef}
      >
        <button className="modal-close" onClick={onClose} aria-label="Cerrar caso">
          {Icon.close()}
        </button>
        <div className="modal-grid">
          <div className="modal-loop">
            <CineLoop
              kind={caso.loop}
              aspect="1/1"
              speed={speed}
              paused={paused}
              showChrome={true}
              media={caso.media}
              quality="full"
            />
            <div className="modal-loop-controls">
              <button
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Reproducir" : "Pausar"}
              >
                {paused ? Icon.play() : Icon.pause()}
              </button>
              <span style={{ opacity: 0.5 }}>·</span>
              {[0.5, 1, 2].map((s) => (
                <button
                  key={s}
                  className={`speed-btn ${speed === s ? "active" : ""}`}
                  onClick={() => setSpeed(s)}
                >
                  {s}×
                </button>
              ))}
              <span style={{ opacity: 0.5 }}>·</span>
              <span style={{ fontSize: 10, opacity: 0.7 }}>CINE-LOOP</span>
            </div>
          </div>
          <div className="modal-body">
            <div className="case-cat">{cat?.label}</div>
            <h2 id="case-modal-title">{caso.title}</h2>
            <div className="modal-author">
              <div className="modal-avatar">{initials}</div>
              <div className="modal-author-meta">
                <span className="name">{caso.author}</span>
                <span className="role">{caso.role}</span>
              </div>
              <span className="date">{dateStr}</span>
            </div>
            <div className="modal-section">
              <h5>Resumen del caso</h5>
              <p id="case-modal-summary">{caso.summary}</p>
            </div>
            <div className="modal-section">
              <h5>Hallazgos ecográficos</h5>
              <p>{caso.findings}</p>
            </div>
            <div className="modal-section modal-diagnosis">
              <h5>Diagnóstico</h5>
              <p>{caso.diagnosis}</p>
            </div>
            <div className="modal-section">
              <h5>Etiquetas</h5>
              <div className="modal-tags">
                {caso.tags.map((t) => (
                  <span key={t} className="tag-chip">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className={isFav ? "fav-active" : ""} onClick={onFav}>
                {Icon.heart(isFav)} {isFav ? "Guardado" : "Guardar"}
              </button>
              <button onClick={onShare}>{Icon.share()} Compartir</button>
              <button onClick={onPresent} aria-label="Modo presentación">
                {Icon.presentation()} Presentar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
