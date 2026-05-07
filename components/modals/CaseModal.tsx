"use client";

import { useMemo, useState } from "react";
import ModalLoopMedia from "./ModalLoopMedia";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { absoluteDate, relativeDate } from "@/lib/relative-date";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useSwipeToClose } from "@/hooks/useSwipeToClose";
import { useNativeDialog } from "@/hooks/useNativeDialog";
import { useScrollProgress } from "@/hooks/useScrollProgress";
import { useModalShortcuts } from "@/hooks/useModalShortcuts";
import {
  difficultyLabel,
  getCaseMedia,
  lastUpdatedFor,
  readingTimeFor,
  wasUpdatedAfterPublication,
} from "@/lib/case-meta";
import { getDescription } from "@/lib/case-description";
import type { CaseRecord } from "@/lib/types";

interface Props {
  caso: CaseRecord;
  onClose: () => void;
  isFav: boolean;
  onFav: () => void;
  onShare: () => void;
  onPresent: () => void;
  // Admin-only chrome (edit / restore / mark reviewed / soft-delete /
  // permanent-delete) used to live as text buttons in the modal
  // footer. They were removed in May-2026 because the footer was
  // overflowing and wrapping awkwardly with too many actions, and
  // because the bulk-edit table now exposes the same flows in a
  // denser place. The modal stays read-only public chrome:
  // favorite, share, presentation. Admin uses the catalog row's ⋮
  // menu or the "Edición" tab for everything else.
}

export default function CaseModal({ caso, onClose, isFav, onFav, onShare, onPresent }: Props) {
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const dialogRef = useNativeDialog<HTMLDialogElement>();
  const { ref: bodyRef, progress: readProgress } = useScrollProgress<HTMLDivElement>();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const swipe = useSwipeToClose<HTMLDivElement>({ onClose });
  // Memoize per-caso derivations: each is a small computation, but they
  // run on every render of an open modal (which can happen frequently —
  // every keystroke in nav, every animation frame elsewhere). useMemo
  // pins them to caso identity, which only changes on prev/next nav.
  const cat = useMemo(() => CATEGORIES.find((c) => c.id === caso.category), [caso.category]);
  const dateLabel = useMemo(() => relativeDate(caso.date), [caso.date]);
  const dateAbsolute = useMemo(() => absoluteDate(caso.date), [caso.date]);
  const initials = useMemo(() => {
    const parts = caso.author.split(/\s+/);
    return (parts.slice(-1)[0]?.[0] || "") + (parts[1]?.[0] || "");
  }, [caso.author]);
  // Single description field. The Apr-2026 UX simplification dropped
  // the separate Resumen / Hallazgos / Diagnóstico sections; the
  // canonical read goes through `getDescription` which falls through
  // the legacy fields for cases that pre-date the migration.
  const description = useMemo(() => getDescription(caso), [caso]);

  // Unified media list for this case. May be empty (case has only the
  // synthetic cine-loop) or contain one or more uploaded items. The
  // modal renders an internal carousel when length > 1 so the reader
  // can step through every attached image without leaving the case.
  const mediaList = useMemo(() => getCaseMedia(caso), [caso]);

  // schema.org structured data for the case. Search engines and rich-
  // result tools (e.g. Google Search Console) parse this JSON-LD to
  // surface the case in articles / medical content panels. We use
  // MedicalScholarlyArticle as the closest fit for an educational
  // clinical case.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MedicalScholarlyArticle",
    headline: caso.title,
    description,
    author: { "@type": "Person", name: caso.author, jobTitle: caso.role },
    datePublished: caso.date,
    articleSection: cat?.label ?? "POCUS",
    keywords: caso.tags.join(", "),
    inLanguage: "es",
    isAccessibleForFree: true,
    publisher: { "@type": "Organization", name: "Taote POCUS" },
  };

  // Modal keyboard shortcuts (Esc / F / S / P). The hook installs the
  // listener and ignores text-input targets + chorded modifiers. The
  // ←/→ stepper between cases was removed in Apr-2026 along with the
  // visible prev/next arrows — the reader now navigates via the grid.
  useModalShortcuts({ onClose, onFav, onShare, onPresent });

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
      aria-describedby="case-modal-description"
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
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Cerrar caso"
          title="Cerrar (Esc)"
        >
          {Icon.close()}
        </button>
        <div className="modal-grid">
          <div className="modal-loop">
            <ModalLoopMedia caso={caso} mediaList={mediaList} speed={speed} paused={paused} />
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
              <time className="date" dateTime={caso.date} title={dateAbsolute}>
                {dateLabel}
              </time>
            </div>
            {/* Single description block. Apr-2026 UX simplification:
                the modal used to render three labeled sections (Resumen
                del caso · Hallazgos ecográficos · Diagnóstico) with a
                pull-quote aside. Editors found the trio redundant for
                short cases, so we collapse to one body — the data
                model still has the three fields for legacy reads, and
                `description` above falls through them in order. */}
            <div className="modal-section modal-section--lede">
              <h5>Descripción</h5>
              {/* The lede paragraph carries the editorial drop cap via
                  ::first-letter CSS, applied through the parent
                  `modal-section--lede` class. Kept as a plain `<p>` so
                  screen readers read the first letter normally. */}
              <p id="case-modal-description">{description}</p>
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
            {/* Footer actions — icon-only chip cluster. Three universal
                affordances (favorite, share, presentation); admin
                actions moved to the catalog's row ⋮ menu and the
                Edición tab. Smaller, calmer, predictable. */}
            <div className="modal-actions">
              <button
                type="button"
                className={"modal-action modal-action--fav" + (isFav ? " is-active" : "")}
                onClick={onFav}
                aria-label={isFav ? "Quitar de favoritos" : "Guardar en favoritos"}
                aria-pressed={isFav}
                title={isFav ? "Quitar de favoritos (F)" : "Guardar en favoritos (F)"}
              >
                {Icon.heart(isFav)}
              </button>
              <button
                type="button"
                className="modal-action"
                onClick={onShare}
                aria-label="Compartir enlace al caso"
                title="Copiar enlace al caso (S)"
              >
                {Icon.share()}
              </button>
              <button
                type="button"
                className="modal-action"
                onClick={onPresent}
                aria-label="Modo presentación"
                title="Modo presentación (P)"
              >
                {Icon.presentation()}
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}

// `pullQuote` and the inline `ModalLoopMedia` were removed in the
// May-2026 cleanup. The carousel lives in `./ModalLoopMedia.tsx` so
// this file stays focused on layout / shortcuts / actions; the
// pull-quote aside was tied to the deprecated three-section body
// and has no anchor in the simplified Descripción flow.
