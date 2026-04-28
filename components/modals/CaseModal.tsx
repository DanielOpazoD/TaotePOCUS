"use client";

import { useEffect, useRef, useState } from "react";
import { CineLoop } from "../cine";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useSwipeToClose } from "@/hooks/useSwipeToClose";
import {
  difficultyLabel,
  lastUpdatedFor,
  readingTimeFor,
  wasUpdatedAfterPublication,
} from "@/lib/case-meta";
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
  const [readProgress, setReadProgress] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const swipe = useSwipeToClose<HTMLDivElement>({ onClose });
  const cat = CATEGORIES.find((c) => c.id === caso.category);
  const dateStr = new Date(caso.date).toLocaleDateString("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const parts = caso.author.split(/\s+/);
  const initials = (parts.slice(-1)[0]?.[0] || "") + (parts[1]?.[0] || "");

  // schema.org structured data for the case. Search engines and rich-
  // result tools (e.g. Google Search Console) parse this JSON-LD to
  // surface the case in articles / medical content panels. We use
  // MedicalScholarlyArticle as the closest fit for an educational
  // clinical case.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MedicalScholarlyArticle",
    headline: caso.title,
    description: caso.summary,
    author: { "@type": "Person", name: caso.author, jobTitle: caso.role },
    datePublished: caso.date,
    articleSection: cat?.label ?? "POCUS",
    keywords: caso.tags.join(", "),
    inLanguage: "es",
    isAccessibleForFree: true,
    publisher: { "@type": "Organization", name: "Taote POCUS" },
  };

  // Open the native dialog on mount, close on unmount.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  // Read progress for the modal-body scroll. The bar at the top of
  // the dialog grows from 0 to 1 — fricción cero, satisface.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollHeight - el.clientHeight;
      setReadProgress(max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, []);

  // Belt-and-braces Escape — see ConfirmDialog for the why.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Click on the dialog element itself = backdrop click = close.
  const onClickDialog = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="case-modal-host"
      // Intentionally no `onClose` event handler — we rely on the
      // explicit close paths (Escape keydown, onCancel, backdrop click,
      // close button, swipe gesture) which all call the parent's
      // `onClose` prop. Listening to the dialog's native `close` event
      // would also fire when the unmount cleanup calls `dialog.close()`,
      // which can re-enter the parent's URL update during transient
      // remounts (React strict mode, unrelated re-renders) and close
      // the modal milliseconds after it opens.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={onClickDialog}
      aria-labelledby="case-modal-title"
      aria-describedby="case-modal-summary"
    >
      {/* JSON-LD structured data — search engines surface the case in
          rich results when the deep-link URL is shared. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div
        className={`modal${swipe.dragging ? " is-dragging" : ""}`}
        style={{
          position: "relative",
          // Follows the finger; resets to 0 on release-without-dismiss.
          // Smooth snap-back transition when not actively dragging.
          transform: swipe.offset ? `translateY(${swipe.offset}px)` : undefined,
          transition: swipe.dragging ? "none" : undefined,
        }}
        ref={(el) => {
          // Fan out into both refs (focus trap + swipe gesture).
          trapRef.current = el;
          swipe.ref.current = el;
        }}
      >
        <div
          className="modal-progress"
          aria-hidden="true"
          style={{ transform: `scaleX(${readProgress})` }}
        />
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
          <div className="modal-body" ref={bodyRef}>
            <div className="case-cat">{cat?.label}</div>
            <h2 id="case-modal-title">{caso.title}</h2>
            <div className="modal-meta-pills">
              <span className={`pill pill-${caso.difficulty ?? "intermediate"}`}>
                {difficultyLabel(caso)}
              </span>
              <span className="pill pill-muted" title="Tiempo de lectura estimado">
                {readingTimeFor(caso)}
              </span>
              {wasUpdatedAfterPublication(caso) && (
                <span className="pill pill-muted" title={`Actualizado: ${lastUpdatedFor(caso)}`}>
                  Actualizado
                </span>
              )}
            </div>
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
    </dialog>
  );
}
