"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CineLoop } from "../cine";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { absoluteDate, relativeDate } from "@/lib/relative-date";
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
  /** Open the edit form pre-populated with this case. Admin only. */
  onEdit?: () => void;
  /** Drop the per-case override (admin), restoring the source values. */
  onResetOverride?: () => void;
  /** True when this case has admin overrides applied — controls the
   *  visibility of the "restore original" affordance. */
  hasOverride?: boolean;
  /** Position of the current case in the navigable set (1-based). */
  position?: number;
  /** Total cases in the navigable set, for the "X / N" indicator. */
  total?: number;
  /** Open the previous case. Disabled when the current is the first. */
  onPrev?: () => void;
  /** Open the next case. Disabled when the current is the last. */
  onNext?: () => void;
}

export default function CaseModal({
  caso,
  onClose,
  isFav,
  onFav,
  onShare,
  onPresent,
  position,
  total,
  onPrev,
  onNext,
  onEdit,
  onResetOverride,
  hasOverride,
}: Props) {
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [readProgress, setReadProgress] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
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
  const quote = useMemo(() => pullQuote(caso), [caso]);

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

  // Keyboard shortcuts for the modal:
  //   - Escape  → close
  //   - ←/→     → previous / next case (when the parent provides
  //              navigation callbacks; ignored if the user is typing
  //              in a field, e.g. inside a search box that the modal
  //              might one day host)
  //   - F / S / P → toggle fav / share / present (mirrors the
  //              kbd hints rendered next to those action buttons)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Ignore shortcuts while typing in a field — the user is
      // composing text, not driving the modal chrome.
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
        return;
      }
      if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
        return;
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        onFav();
        return;
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        onShare();
        return;
      }
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        onPresent();
        return;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onPrev, onNext, onFav, onShare, onPresent]);

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
        {/* Per-modal nav: prev / position / next pill, pinned to the
            top edge of the dialog. Hidden on the first/last item or
            when the parent didn't provide nav callbacks (e.g. opened
            via a deep link without a filter context). */}
        {position !== undefined && total !== undefined && total > 1 && (
          <div className="modal-nav" aria-label="Navegación entre casos">
            <button
              type="button"
              className="modal-nav-btn"
              onClick={onPrev}
              disabled={!onPrev}
              aria-label="Caso anterior"
              title="Anterior (←)"
            >
              {Icon.arrowLeft()}
            </button>
            <span className="modal-nav-pos tnum" aria-live="polite">
              {position} / {total}
            </span>
            <button
              type="button"
              className="modal-nav-btn"
              onClick={onNext}
              disabled={!onNext}
              aria-label="Caso siguiente"
              title="Siguiente (→)"
            >
              {Icon.arrowRight()}
            </button>
          </div>
        )}
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
            <CineLoop
              kind={caso.loop}
              aspect="1/1"
              speed={speed}
              paused={paused}
              showChrome={true}
              media={caso.media}
              quality="full"
              // In the modal we honor the media's native ratio so the
              // user sees the case at its real proportions instead of
              // squeezed into a square. The thumbnail in the grid keeps
              // the uniform 1/1 to preserve the grid rhythm.
              preserveNativeAspect={true}
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
              <time className="date" dateTime={caso.date} title={dateAbsolute}>
                {dateLabel}
              </time>
            </div>
            <div className="modal-section modal-section--lede">
              <h5>Resumen del caso</h5>
              {/* The lede paragraph carries the editorial drop cap.
                  The first letter is rendered by ::first-letter CSS,
                  not a span, so screen readers read it normally. */}
              <p id="case-modal-summary">{caso.summary}</p>
            </div>
            <div className="modal-section">
              <h5>Hallazgos ecográficos</h5>
              {/* Pull-quote in the right margin. Pulls the most
                  resonant sentence from findings (or diagnosis when
                  findings is short) and renders it as serif italic
                  marginalia. The aside is decorative — same content
                  appears in the prose, so we mark it aria-hidden. */}
              {quote && (
                <aside className="modal-pullquote" aria-hidden="true">
                  {quote}
                </aside>
              )}
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
              <button
                className={isFav ? "fav-active" : ""}
                onClick={onFav}
                title={isFav ? "Quitar de favoritos (F)" : "Guardar en favoritos (F)"}
              >
                {Icon.heart(isFav)} {isFav ? "Guardado" : "Guardar"}
                <kbd className="kbd-hint" aria-hidden="true">
                  F
                </kbd>
              </button>
              <button onClick={onShare} title="Copiar enlace al caso (S)">
                {Icon.share()} Compartir
                <kbd className="kbd-hint" aria-hidden="true">
                  S
                </kbd>
              </button>
              <button
                onClick={onPresent}
                aria-label="Modo presentación"
                title="Modo presentación (P)"
              >
                {Icon.presentation()} Presentar
                <kbd className="kbd-hint" aria-hidden="true">
                  P
                </kbd>
              </button>
              {/* Admin-only edit affordance. Visible only when the
                  parent passes `onEdit` (i.e. the current user is
                  admin). The "restore original" button appears only
                  when this case has overrides applied — keeps the
                  toolbar quiet for unedited cases. */}
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="btn-edit"
                  title="Editar este caso (admin)"
                  aria-label="Editar caso"
                >
                  {Icon.edit()} Editar
                </button>
              )}
              {hasOverride && onResetOverride && (
                <button
                  onClick={onResetOverride}
                  className="btn-edit"
                  title="Descartar ediciones y restaurar el contenido original"
                  aria-label="Restaurar original"
                >
                  Restaurar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/**
 * Extract a short, self-contained sentence from the case to render
 * as a margin pull-quote next to the findings paragraph. We bias
 * toward `diagnosis` (it's usually the most resonant single line),
 * fall through to the first sentence of `findings`, and gate on a
 * minimum/maximum length so the marginalia doesn't dominate the
 * column. Returns null when nothing usable exists — the aside then
 * doesn't render.
 */
function pullQuote(c: CaseRecord): string | null {
  const candidate = (c.diagnosis || c.findings || "").trim();
  if (!candidate) return null;
  const first = candidate.split(/\.\s+/)[0]?.trim() ?? "";
  if (first.length < 20 || first.length > 140) return null;
  return first.endsWith(".") ? first : `${first}.`;
}
