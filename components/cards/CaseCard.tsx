"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { CineLoop } from "../cine";
import AdminThumbMenu from "./AdminThumbMenu";
import FallbackBadge from "./FallbackBadge";
import { Icon, CategoryGlyph, CustomCategoryGlyph } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { absoluteDate, relativeDate } from "@/lib/relative-date";
import { getCaseDescription, getCaseTags, getCaseTitle } from "@/lib/case-localized";
import { categoryLabel } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import { caseThumbViewTransitionName } from "@/lib/view-transition";
import { highlight } from "@/lib/highlight";
import { resolveFocus } from "@/lib/focus";
import type { CaseRecord, Category, FocusDefaults } from "@/lib/types";

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
  /** Admin-managed focus defaults (global / per-section / per-category).
   *  Resolved against `caso.focus` at render: a per-case override
   *  always wins. Optional — when omitted the renderer uses only
   *  `caso.focus` (legacy behaviour, fine for tests). */
  focusDefaults?: FocusDefaults;
  /** `true` when this card's case is currently open in the modal —
   *  the orchestrator forwards `openCaseId === caso.id`. When true,
   *  the thumb's `view-transition-name` is suppressed so the modal
   *  hero can carry the name without colliding. When false, the
   *  thumb is the named element and the modal-open animation
   *  morphs from this card's position. Optional; defaults to
   *  `false` (no transition target). */
  isViewTransitionTarget?: boolean;
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
  focusDefaults,
  isViewTransitionTarget = false,
}: Props) {
  const { lang, t } = useLanguage();
  // Resolve every translatable field once per render; reuse below.
  // The `isFallback` flag from each helper feeds the `<FallbackBadge>`
  // that renders next to the affected text when the user picked EN
  // and the admin hasn't translated this case yet.
  const titleRead = getCaseTitle(caso, lang);
  const descRead = getCaseDescription(caso, lang);
  const tagsRead = getCaseTags(caso, lang);
  // Live-preview focus while the FocusEditor is open. Falls back to
  // the resolved focus (per-case override → category default →
  // section default → global default → undefined / hardcoded
  // center). See `lib/focus.ts → resolveFocus`.
  const [draftFocus, setDraftFocus] = useState<{ x: number; y: number; scale: number } | undefined>(
    undefined,
  );
  const resolvedFocus = focusDefaults ? resolveFocus(caso, focusDefaults) : caso.focus;
  const effectiveFocus = draftFocus ?? resolvedFocus;
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
  const handleAnchorClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Anchor-cover pattern: the `<a>` has a real `href` (`?caso=<id>`)
      // so the card is a navigable, keyboard-activatable, copy-link-
      // shareable surface even without JS. With JS, preventDefault +
      // `onOpen` swaps the navigation for the in-page modal mount,
      // which matches the prior `<div role="button">` behavior.
      //
      // Modifier keys (Cmd / Ctrl / Shift / Alt / middle-click) let
      // the native anchor behavior run — power users get
      // open-in-new-tab back, which the prior `<div role="button">`
      // could never offer.
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      e.preventDefault();
      handleOpen();
    },
    [handleOpen],
  );
  const handleAnchorKey = useCallback(
    (e: React.KeyboardEvent<HTMLAnchorElement>) => {
      // Native anchors activate on Enter (browser fires a synthetic
      // click), but NOT on Space. The prior `<div role="button">`
      // activated on both — we preserve that here so users who built
      // muscle memory around Space-to-open don't regress on the
      // refactor. Enter passes through to the native click path so
      // we don't double-trigger.
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        handleOpen();
      }
    },
    [handleOpen],
  );
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
    // Anchor-cover pattern. The card is an `<article>` (landmark
    // semantic — screen readers announce it as a region with the
    // h2 title as its accessible name), NOT a focusable `<button>`.
    // The actual open-case action lives on a real `<a>` inside the
    // h2 below, whose `::after` pseudo-element stretches across the
    // whole card (`.case-card-link::after { position: absolute; inset: 0; }`).
    // This eliminates the prior nested-interactive a11y violation
    // (focusable `<button class="case-thumb-fav">` inside focusable
    // `<div role="button">`) — now the fav button and the link are
    // SIBLINGS in the focus order, not nested, and the link is the
    // only Tab stop for "open this case".
    //
    // The anchor's `href="?caso=<id>"` is also genuinely navigable:
    // copy-link works, open-in-new-tab works (the click handler
    // bails on modifier keys), and JS-disabled visitors still land
    // on the modal-open URL state.
    <article className="case-card">
      <div
        className="case-thumb"
        // View Transitions API morph target. Name suppressed when
        // this card is the currently-open one — the modal's hero
        // carries the name then, and a duplicate would crash the
        // browser's pre-snapshot validation. See
        // `lib/view-transition.ts > caseThumbViewTransitionName`.
        style={{
          viewTransitionName: isViewTransitionTarget
            ? "none"
            : caseThumbViewTransitionName(caso.id),
        }}
      >
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
          {/* First sentence of the active-language description (with
              EN→ES fallback). Imported cases that ship as ES-only
              still render the preview because the helper falls
              through to the Spanish baseline. */}
          <p>{firstSentence(descRead.value)}</p>
        </div>
        {/* Admin-only review badge — appears top-right under the fav
            button when the editorial review has been confirmed. The
            `data-reviewed` attribute lets CSS hide it for non-admin
            users via a parent class on the layout. */}
        {caso.reviewed && (
          <span
            className="case-thumb-reviewed"
            title={t("card.reviewed.title")}
            aria-label={t("card.reviewed.aria")}
          >
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
          aria-label={t("card.fav.aria")}
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
          <span>{cat ? categoryLabel(cat, lang) : ""}</span>
        </div>
        {/* h2 (not h3): the page chrome ships only an h1 (the section
            brand), so the cards must be h2 to keep the heading
            hierarchy contiguous. Lighthouse "heading-order" failed
            with h3 here because there's no intervening h2 between the
            page h1 and these card titles. */}
        <h2 className="case-title">
          <a
            href={`?caso=${encodeURIComponent(caso.id)}`}
            className="case-card-link"
            onClick={handleAnchorClick}
            onKeyDown={handleAnchorKey}
          >
            {searchQuery ? highlight(titleRead.value, searchQuery) : titleRead.value}
          </a>
          {titleRead.isFallback && <FallbackBadge read={titleRead} />}
        </h2>
        {/* Short blurb under the title in the active language. */}
        <p className="case-summary">
          {searchQuery ? highlight(descRead.value, searchQuery) : descRead.value}
          {descRead.isFallback && <FallbackBadge read={descRead} inline />}
        </p>
        <div className="case-byline">
          <span>{caso.author}</span>
          <span className="dot"></span>
          <time dateTime={caso.date} title={dateAbsolute}>
            {dateLabel}
          </time>
        </div>
        <div className="case-tags">
          {tagsRead.tags.slice(0, 3).map((t) => (
            <span key={t} className="case-tag-mini">
              {searchQuery ? highlight(t, searchQuery) : t}
            </span>
          ))}
          {tagsRead.isFallback && tagsRead.tags.length > 0 && (
            <FallbackBadge read={{ value: "", isFallback: true, source: "es" }} />
          )}
        </div>
      </div>
    </article>
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
