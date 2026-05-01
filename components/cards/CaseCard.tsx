"use client";

import { useEffect, useRef, useState } from "react";
import { CineLoop } from "../cine";
import AdminThumbMenu from "./AdminThumbMenu";
import { Icon, CategoryGlyph } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { absoluteDate, relativeDate } from "@/lib/relative-date";
import { getDescription } from "@/lib/case-description";
import type { CaseRecord, Category } from "@/lib/types";

interface Props {
  caso: CaseRecord;
  isFav: boolean;
  onFav: () => void;
  onOpen: () => void;
  /** Admin only: soft-delete the case. When provided, a trash chip
   *  appears on the thumbnail. Click stops propagation so it doesn't
   *  open the modal. */
  onDelete?: () => void;
  /** Admin only: permanent-delete the case (irreversible). Same chip
   *  cluster as `onDelete`, but a separate red × button. */
  onPurge?: () => void;
  /** Admin only: apply a section / category override directly from
   *  the card. When provided alongside `categories`, a `⇄` chip
   *  opens a quick-reclassify popover. */
  onPatch?: (id: string, patch: Partial<CaseRecord>) => void;
  /** Categories list (built-in + custom). Required if `onPatch` is
   *  passed — without it the popover would only show sections. */
  categories?: Category[];
}

export default function CaseCard({
  caso,
  isFav,
  onFav,
  onOpen,
  onDelete,
  onPurge,
  onPatch,
  categories,
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

  const onFavClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Visual reward asymmetric: only animate on becoming-a-fav, not
    // on un-fav. Subtler that way.
    if (!isFav) {
      setBursting(true);
      if (burstTimerRef.current !== null) clearTimeout(burstTimerRef.current);
      burstTimerRef.current = setTimeout(() => {
        setBursting(false);
        burstTimerRef.current = null;
      }, 600);
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
        <CineLoop
          kind={caso.loop}
          aspect="1/1"
          speed={0.8}
          showChrome={true}
          media={caso.media}
          focus={effectiveFocus}
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
            onDelete={onDelete}
            onPurge={onPurge}
            onFocusDraftChange={setDraftFocus}
          />
        )}
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
        {/* Short blurb under the title — also pulls from the canonical
            description rather than the legacy `summary` slot. */}
        <p className="case-summary">{getDescription(caso)}</p>
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

/** First sentence of a body string, with a trailing period. Returns
 *  an empty string when the input is empty so the hover preview can
 *  render conditionally. */
function firstSentence(text: string): string {
  if (!text) return "";
  const head = text.split(/\.\s+/)[0]?.trim() ?? "";
  if (!head) return "";
  return head.endsWith(".") ? head : `${head}.`;
}
