"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { CineLoop } from "../cine";
import AdminThumbMenu from "./AdminThumbMenu";
import { Icon, CategoryGlyph, CustomCategoryGlyph } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { absoluteDate, relativeDate } from "@/lib/relative-date";
import { getDescription } from "@/lib/case-description";
import { highlight } from "@/lib/highlight";
import type { CaseRecord, Category } from "@/lib/types";

// Callbacks receive the `caso` themselves rather than being closed
// over by the parent. This is the SINGLE biggest perf win on the
// catalog grid: the parent (`MainGrid`) used to wrap each callback
// in an inline closure (`() => onToggleFav(c)`), which created a
// fresh function identity per card per render and defeated any
// downstream memoization. With the `caso`-receiving shape, the
// parent passes the same stable function reference to every card,
// `React.memo` below detects the unchanged props, and category
// changes only re-render cards that actually entered or left the
// `filtered` set.
interface Props {
  caso: CaseRecord;
  isFav: boolean;
  onFav: (caso: CaseRecord) => void;
  onOpen: (caso: CaseRecord) => void;
  /** Admin only: soft-delete the case. When provided, a trash chip
   *  appears on the thumbnail. Click stops propagation so it doesn't
   *  open the modal. */
  onDelete?: (caso: CaseRecord) => void;
  /** Admin only: permanent-delete the case (irreversible). Same chip
   *  cluster as `onDelete`, but a separate red × button. */
  onPurge?: (caso: CaseRecord) => void;
  /** Admin only: apply a section / category override directly from
   *  the card. Already takes (id, patch) — naturally stable. */
  onPatch?: (id: string, patch: Partial<CaseRecord>) => void;
  /** Categories list (built-in + custom). Required if `onPatch` is
   *  passed — without it the popover would only show sections. */
  categories?: Category[];
  /** When true, hint the browser to fetch this card's media with
   *  high priority (eager loading + fetchPriority="high"). Use only
   *  for the first ~6 cards in the grid — those above the fold,
   *  which are LCP candidates. The rest stay lazy. */
  priority?: boolean;
  /** Active text query — when non-empty, the title / description /
   *  tag text gets matched substrings wrapped in `<mark>` so the
   *  user sees WHY a card landed in the result set. Empty / undefined
   *  renders the text plain. */
  searchQuery?: string;
}

function CaseCardImpl({
  caso,
  isFav,
  onFav,
  onOpen,
  onDelete,
  onPurge,
  onPatch,
  categories,
  priority = false,
  searchQuery,
}: Props) {
  // Live-preview focus while the FocusEditor is open. Falls back to
  // the persisted `caso.focus` when the editor is closed (or never
  // opened). The CineLoop reads the resolved focus directly — no
  // CSS injection, just a normal prop.
  const [draftFocus, setDraftFocus] = useState<{ x: number; y: number; scale: number } | undefined>(
    undefined,
  );
  const effectiveFocus = draftFocus ?? caso.focus;
  const cat = CATEGORIES.find((c) => c.id === caso.category);
  // The "Crítico" red pulsing badge was removed in May-2026 — see the
  // file header for the rationale and the CSS comment in cards.css
  // where `.case-thumb-crit` used to live. The tag string itself can
  // still appear in `caso.tags` and renders like any other chip.
  const [bursting, setBursting] = useState(false);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Relative date as the visible label, absolute date as the tooltip
  // hover. Older publications fall back to absolute automatically —
  // see lib/relative-date.ts for the rules.
  const dateLabel = relativeDate(caso.date);
  const dateAbsolute = absoluteDate(caso.date);

  // Drop the burst timer on unmount so a fast favorite + route change
  // (which unmounts the card mid-animation) doesn't leak a setState
  // on the dead component.
  useEffect(
    () => () => {
      if (burstTimerRef.current !== null) clearTimeout(burstTimerRef.current);
    },
    [],
  );

  // Local handlers close over the stable parent callbacks + the
  // current `caso`. They're created once per card render but they
  // don't propagate as props to children that themselves memoize, so
  // the cost is trivial. The win is that the OUTGOING props
  // (`onFav`, `onOpen`, etc. from the parent) are now stable, so
  // React.memo below sees unchanged props on category changes.
  const handleOpen = useCallback(() => onOpen(caso), [onOpen, caso]);
  const handleFavClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Visual reward asymmetric: only animate on becoming-a-fav,
      // not on un-fav. Subtler that way.
      if (!isFav) {
        setBursting(true);
        if (burstTimerRef.current !== null) clearTimeout(burstTimerRef.current);
        burstTimerRef.current = setTimeout(() => {
          setBursting(false);
          burstTimerRef.current = null;
        }, 600);
      }
      onFav(caso);
    },
    [onFav, caso, isFav],
  );
  // Delete + purge wrappers for AdminThumbMenu, which expects the
  // parameterless callback shape (it doesn't know about the caso it
  // belongs to — that's the card's job to bind).
  const handleDelete = onDelete ? () => onDelete(caso) : undefined;
  const handlePurge = onPurge ? () => onPurge(caso) : undefined;
  return (
    <div
      className="case-card"
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen();
        }
      }}
    >
      <div className="case-thumb">
        <CineLoop
          kind={caso.loop}
          aspect="1/1"
          speed={0.8}
          showChrome={true}
          media={caso.media}
          focus={effectiveFocus}
          priority={priority}
        />
        <div className="case-thumb-overlay"></div>
        <div className="case-thumb-preview">
          {/* First sentence of the canonical description. Falls back
              to the legacy fields via `getDescription` so imported
              cases keep their hover preview. */}
          <p>{firstSentence(getDescription(caso))}</p>
        </div>
        {/* Admin-only review badge — appears top-right under the fav
            button when the editorial review has been confirmed. The
            `data-reviewed` attribute lets CSS hide it for non-admin
            users via a parent class on the layout. */}
        {caso.reviewed && (
          <span className="case-thumb-reviewed" title="Caso revisado" aria-label="Revisado">
            ✓
          </span>
        )}
        {/* Single admin entry point: one `⋮` chip that hosts all four
            actions (reclasificar / foco / mover-a-papelera / eliminar
            permanentemente) inside one dropdown. Replaces the four
            separate chips that used to crowd the thumbnail corner. */}
        {onPatch && categories && (
          <AdminThumbMenu
            caso={caso}
            categories={categories}
            onPatch={onPatch}
            onDelete={handleDelete}
            onPurge={handlePurge}
            onFocusDraftChange={setDraftFocus}
          />
        )}
        <button
          className={`case-thumb-fav${isFav ? " active" : ""}${bursting ? " is-bursting" : ""}`}
          onClick={handleFavClick}
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
            {CategoryGlyph[caso.category] ?? CustomCategoryGlyph}
          </span>
          <span>{cat?.label}</span>
        </div>
        <h3 className="case-title">
          {searchQuery ? highlight(caso.title, searchQuery) : caso.title}
        </h3>
        {/* Short blurb under the title — also pulls from the canonical
            description rather than the legacy `summary` slot. */}
        <p className="case-summary">
          {(() => {
            const desc = getDescription(caso);
            return searchQuery ? highlight(desc, searchQuery) : desc;
          })()}
        </p>
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
              {searchQuery ? highlight(t, searchQuery) : t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** First sentence of a body string, with a trailing period. Returns
 *  an empty string when the input is empty so the hover preview can
 *  render conditionally. */
function firstSentence(text: string): string {
  if (!text) return "";
  const head = text.split(/\.\s+/)[0]?.trim() ?? "";
  if (!head) return "";
  return head.endsWith(".") ? head : `${head}.`;
}

/**
 * `React.memo` wrap. Default shallow comparison is sufficient because
 * the parent now passes stable callback references (after the
 * `MainGrid` rewrite that drops the per-card inline closures). On a
 * category change the cards that stay in the filtered set get the
 * SAME `caso` reference (preserved through `mergeWithOverrides`'s
 * identity-when-no-override optimization) and the SAME callback
 * references — `memo` short-circuits the re-render entirely.
 *
 * The `caso` reference IS preserved across renders for cases without
 * overrides; for cases with overrides, `mergeWithOverrides` produces
 * a new object only when the override map for that id changes — also
 * stable across category clicks.
 */
const CaseCard = memo(CaseCardImpl);
CaseCard.displayName = "CaseCard";
export default CaseCard;
