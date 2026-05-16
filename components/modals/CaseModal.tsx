"use client";

import { useMemo, useState } from "react";
import ModalLoopMedia from "./ModalLoopMedia";
import RelatedCases from "./RelatedCases";
import FallbackBadge from "../cards/FallbackBadge";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { absoluteDate, relativeDate } from "@/lib/relative-date";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useSwipeToClose } from "@/hooks/useSwipeToClose";
import { useNativeDialog } from "@/hooks/useNativeDialog";
import { useScrollProgress } from "@/hooks/useScrollProgress";
import { useModalShortcuts } from "@/hooks/useModalShortcuts";
import { useLanguage } from "@/hooks/useLanguage";
import { caseThumbViewTransitionName } from "@/lib/view-transition";
import { highlight } from "@/lib/highlight";
import {
  difficultyLabel,
  getCaseMedia,
  lastUpdatedFor,
  readingTimeFor,
  wasUpdatedAfterPublication,
} from "@/lib/case-meta";
import { getCaseDescription, getCaseTags, getCaseTitle } from "@/lib/case-localized";
import { categoryLabel } from "@/lib/i18n";
import type { CaseRecord } from "@/lib/types";

interface Props {
  caso: CaseRecord;
  onClose: () => void;
  isFav: boolean;
  onFav: () => void;
  onShare: () => void;
  onPresent: () => void;
  /** Top-N editorially-related cases (see `lib/related-cases.ts`).
   *  Computed by the parent so the ranking is memoized off the
   *  catalog identity. Empty array hides the rail. Optional so
   *  focused tests can mount the modal without threading the full
   *  catalog. */
  relatedCases?: CaseRecord[];
  /** Click handler for a related case. Same contract as the grid's
   *  `onCardOpen` — pushPatch caso wrapped in a view transition.
   *  Required only when `relatedCases` is non-empty. */
  onOpenRelated?: (c: CaseRecord) => void;
  /** Active text query — when non-empty, the modal title +
   *  description get matched substrings wrapped in `<mark>`, same
   *  treatment the grid cards already apply. Empty / undefined
   *  renders the text plain. Useful when the user deep-linked from
   *  a search result and opened the modal: the highlight makes it
   *  obvious WHY the case was in the result set. */
  searchQuery?: string;
  // Admin-only chrome (edit / restore / mark reviewed / soft-delete /
  // permanent-delete) used to live as text buttons in the modal
  // footer. They were removed in May-2026 because the footer was
  // overflowing and wrapping awkwardly with too many actions, and
  // because the bulk-edit table now exposes the same flows in a
  // denser place. The modal stays read-only public chrome:
  // favorite, share, presentation. Admin uses the catalog row's ⋮
  // menu or the "Edición" tab for everything else.
}

export default function CaseModal({
  caso,
  onClose,
  isFav,
  onFav,
  onShare,
  onPresent,
  relatedCases,
  onOpenRelated,
  searchQuery,
}: Props) {
  const { lang, t } = useLanguage();
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
  // Bilingual reads. Each returns `{ value, isFallback, source }` so
  // the renderer can show the small "ES" badge when EN is missing.
  const titleRead = useMemo(() => getCaseTitle(caso, lang), [caso, lang]);
  const descRead = useMemo(() => getCaseDescription(caso, lang), [caso, lang]);
  const tagsRead = useMemo(() => getCaseTags(caso, lang), [caso, lang]);

  // Unified media list for this case. May be empty (case has only the
  // synthetic cine-loop) or contain one or more uploaded items. The
  // modal renders an internal carousel when length > 1 so the reader
  // can step through every attached image without leaving the case.
  const mediaList = useMemo(() => getCaseMedia(caso), [caso]);

  // schema.org structured data for the case. Search engines and rich-
  // result tools (e.g. Google Search Console) parse this JSON-LD to
  // surface the case in articles / medical content panels. We use
  // MedicalScholarlyArticle as the closest fit for an educational
  // clinical case. The `inLanguage` field reflects the active UI
  // language so a deep link shared in EN-mode is annotated correctly.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MedicalScholarlyArticle",
    headline: titleRead.value,
    description: descRead.value,
    author: { "@type": "Person", name: caso.author, jobTitle: caso.role },
    datePublished: caso.date,
    articleSection: cat ? categoryLabel(cat, lang) : "POCUS",
    keywords: tagsRead.tags.join(", "),
    inLanguage: lang,
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
          aria-label={t("modal.close.aria")}
          title={t("modal.close.title")}
        >
          {Icon.close()}
        </button>
        <div className="modal-grid">
          <div
            className="modal-loop"
            // View Transitions API — name MUST match the
            // corresponding `.case-thumb` element on the originating
            // card so the browser morphs between the two. The
            // matching CaseCard / FeaturedCard suppresses ITS name
            // when it sees its case is open, so this `case-thumb-<id>`
            // is the only named element in the new snapshot. See
            // `lib/view-transition.ts` for the orchestration.
            style={{ viewTransitionName: caseThumbViewTransitionName(caso.id) }}
          >
            <ModalLoopMedia caso={caso} mediaList={mediaList} speed={speed} paused={paused} />
            <div className="modal-loop-controls">
              <button
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? t("modal.play.aria") : t("modal.pause.aria")}
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
              <span style={{ color: "var(--ink-mute)" }} aria-hidden="true">
                ·
              </span>
              {/*
                Decorative chrome label inside the modal speed-controls
                row — mimics the corner overlay an ultrasound machine
                paints on cine loops. Uses `--ink-mute` (≈ 50% lightness
                gray) so the foreground meets WCAG AA contrast against
                the modal's near-white background; the previous
                `opacity: 0.7` over `#fdfdfc` rendered at 1.02:1.
                `aria-hidden` keeps it out of the screen-reader output
                — the surrounding speed buttons + the cine canvas
                itself carry the semantic meaning.
              */}
              <span
                style={{ fontSize: 10, color: "var(--ink-mute)", letterSpacing: "0.05em" }}
                aria-hidden="true"
              >
                CINE-LOOP
              </span>
            </div>
          </div>
          <div className="modal-body" ref={bodyRef}>
            <div className="case-cat">{cat ? categoryLabel(cat, lang) : ""}</div>
            <h2 id="case-modal-title">
              {searchQuery ? highlight(titleRead.value, searchQuery) : titleRead.value}
              {titleRead.isFallback && <FallbackBadge read={titleRead} />}
            </h2>
            <div className="modal-meta-pills">
              <span className={`pill pill-${caso.difficulty ?? "intermediate"}`}>
                {difficultyLabel(caso, lang)}
              </span>
              <span className="pill pill-muted" title={t("modal.readingTime.title")}>
                {readingTimeFor(caso, lang)}
              </span>
              {wasUpdatedAfterPublication(caso) && (
                <span
                  className="pill pill-muted"
                  title={t("modal.lastUpdated.title", { date: lastUpdatedFor(caso, lang) })}
                >
                  {t("modal.updated")}
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
            {/* Single description block in the active language. The
                helper falls back to ES when the EN slot is missing —
                surfaced visually by `FallbackBadge` next to the
                section heading so the reader knows why they're
                seeing Spanish copy in EN mode. */}
            <div className="modal-section modal-section--lede">
              <h5>
                {t("modal.section.description")}
                {descRead.isFallback && <FallbackBadge read={descRead} />}
              </h5>
              {/* The lede paragraph carries the editorial drop cap via
                  ::first-letter CSS, applied through the parent
                  `modal-section--lede` class. Kept as a plain `<p>` so
                  screen readers read the first letter normally. */}
              <p id="case-modal-description">
                {searchQuery ? highlight(descRead.value, searchQuery) : descRead.value}
              </p>
            </div>
            <div className="modal-section">
              <h5>
                {t("modal.section.tags")}
                {tagsRead.isFallback && tagsRead.tags.length > 0 && (
                  <FallbackBadge read={{ value: "", isFallback: true, source: tagsRead.source }} />
                )}
              </h5>
              <div className="modal-tags">
                {tagsRead.tags.map((tag) => (
                  <span key={tag} className="tag-chip">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            {/* Related cases rail — small list of editorially-similar
                cases scored in `lib/related-cases.ts`. Renders
                nothing when the list is empty. Click swaps the modal
                content in place via the existing pushPatch caso
                pipeline (View Transitions wraps the swap so it
                crossfades smoothly). */}
            {relatedCases && relatedCases.length > 0 && onOpenRelated && (
              <RelatedCases cases={relatedCases} onOpen={onOpenRelated} />
            )}
            {/* Footer actions — icon-only chip cluster. Three universal
                affordances (favorite, share, presentation); admin
                actions moved to the catalog's row ⋮ menu and the
                Edición tab. Smaller, calmer, predictable. */}
            <div className="modal-actions">
              <button
                type="button"
                className={"modal-action modal-action--fav" + (isFav ? " is-active" : "")}
                onClick={onFav}
                aria-label={isFav ? t("modal.unfav.aria") : t("modal.fav.aria")}
                aria-pressed={isFav}
                title={isFav ? t("modal.unfav.title") : t("modal.fav.title")}
              >
                {Icon.heart(isFav)}
              </button>
              <button
                type="button"
                className="modal-action"
                onClick={onShare}
                aria-label={t("modal.share.aria")}
                title={t("modal.share.title")}
              >
                {Icon.share()}
              </button>
              <button
                type="button"
                className="modal-action"
                onClick={onPresent}
                aria-label={t("modal.present.aria")}
                title={t("modal.present.title")}
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
