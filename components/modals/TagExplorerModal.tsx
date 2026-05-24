"use client";

// Tag explorer — full-list modal that surfaces ALL tags in the
// active corpus, with search + per-tag case count + click-to-filter.
// The sidebar's compact 14-chip cloud is the "quick scan" view; this
// modal is the "I want to drill in across 196+ tags" view. Public
// readers see the search + click-to-filter affordance. Admin readers
// see an additional per-row delete button and a separate
// "hidden-tags" section with restore controls.
//
// Deletion semantics: tags are NEVER mutated on case records. The
// admin click adds the tag string to a localStorage-backed
// `hiddenTags` set (see `useTagVisibility`). Every consumer of the
// tag list — sidebar cloud (via `useCaseFilters`), card chip strip,
// case modal — filters through the same set. The corpus stays
// pristine; the operation is fully reversible.
//
// A11y: dialog + focus trap (`useFocusTrap`), Esc closes, swipe-down
// closes (`useSwipeToClose`), Native `<dialog>` element drives the
// backdrop. Mirrors the contract documented in CaseModal.tsx.

import { useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useNativeDialog } from "@/hooks/useNativeDialog";
import { useSwipeToClose } from "@/hooks/useSwipeToClose";
import { useLanguage } from "@/hooks/useLanguage";

interface TagWithCount {
  tag: string;
  count: number;
}

interface Props {
  /** All tags + their case counts in the active filter scope. Ordered
   *  by count desc by the caller. Already excludes admin-hidden tags
   *  on the public path (App.tsx passes the filtered list); admin
   *  view passes the full + hidden list separately. */
  tags: TagWithCount[];
  /** Tags the admin has marked hidden — rendered in their own
   *  section with restore buttons. Empty for non-admin views (or
   *  when no tags are hidden). */
  hiddenTags: string[];
  /** Active tag filters in the URL — chips for active tags render
   *  as `.tag-chip.active`. */
  activeTags: string[];
  /** Click handler — closes the modal AND applies the tag as the
   *  active filter (single-tag replace, matching the case-modal tag
   *  click semantics shipped in PR #150). */
  onSelectTag: (tag: string) => void;
  /** Admin-only — hide a tag from every consuming surface. Renders
   *  the per-row delete button when provided. */
  onHideTag?: (tag: string) => void;
  /** Admin-only — restore a previously-hidden tag. Renders the
   *  per-row restore button in the "hidden-tags" section. */
  onRestoreTag?: (tag: string) => void;
  /** Close handler — bound to dialog dismiss + the × button +
   *  swipe-to-close. */
  onClose: () => void;
}

export default function TagExplorerModal({
  tags,
  hiddenTags,
  activeTags,
  onSelectTag,
  onHideTag,
  onRestoreTag,
  onClose,
}: Props) {
  const { t } = useLanguage();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const dialogRef = useNativeDialog<HTMLDialogElement>();
  // Swipe-down to dismiss — same gesture readers use to close the
  // case modal; documented in `useSwipeToClose`. Below 880 px the
  // ↓ drag fires `onClose`; partial drags snap back. Desktop is
  // unaffected (gesture skipped at wide viewports per the hook).
  const swipe = useSwipeToClose<HTMLDivElement>({ onClose });

  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();

  // Filtered view of the public tag list. Case-insensitive substring
  // match against the tag string; counts stay attached so the chip
  // can render "tag · 12" without re-counting. Empty query returns
  // the full list (already sorted by count desc by the caller).
  const visible = useMemo(() => {
    if (!trimmed) return tags;
    return tags.filter((entry) => entry.tag.toLowerCase().includes(trimmed));
  }, [tags, trimmed]);

  const showHiddenSection = hiddenTags.length > 0 && !!onRestoreTag;

  return (
    <dialog
      ref={dialogRef}
      className="modal-host modal-host--tag-explorer"
      aria-labelledby="tag-explorer-title"
    >
      <div
        className="modal modal--tag-explorer"
        style={{
          position: "relative",
          transform: swipe.offset ? `translateY(${swipe.offset}px)` : undefined,
          transition: swipe.dragging ? "none" : undefined,
        }}
        ref={(el) => {
          trapRef.current = el;
          swipe.ref.current = el;
        }}
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label={t("tagExplorer.close.aria")}
          title={t("tagExplorer.close.title")}
        >
          {Icon.close()}
        </button>

        <header className="tag-explorer-head">
          <h2 id="tag-explorer-title">{t("tagExplorer.title")}</h2>
          <p className="tag-explorer-sub">{t("tagExplorer.summary", { count: tags.length })}</p>
        </header>

        {/* Search field. Auto-focused on mount via `autoFocus` (the
            focus trap will keep it inside the dialog). Live-filters
            the chips below as the user types — common pattern from
            the command palette. */}
        <div className="tag-explorer-search">
          <span className="tag-explorer-search-icon" aria-hidden="true">
            {Icon.search()}
          </span>
          <input
            type="search"
            className="tag-explorer-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("tagExplorer.search.placeholder")}
            aria-label={t("tagExplorer.search.aria")}
            autoFocus
          />
        </div>

        {visible.length === 0 ? (
          <p className="tag-explorer-empty">{t("tagExplorer.empty")}</p>
        ) : (
          <ul className="tag-explorer-list">
            {visible.map(({ tag, count }) => {
              const isActive = activeTags.includes(tag);
              return (
                <li key={tag} className="tag-explorer-row">
                  <button
                    type="button"
                    className={`tag-explorer-chip${isActive ? " is-active" : ""}`}
                    onClick={() => onSelectTag(tag)}
                  >
                    <span className="tag-explorer-name">{tag}</span>
                    <span className="tag-explorer-count tnum">{count}</span>
                  </button>
                  {/* Admin-only delete button. Stops propagation so
                      the click doesn't also trigger the filter chip
                      next to it. */}
                  {onHideTag && (
                    <button
                      type="button"
                      className="tag-explorer-row-action tag-explorer-row-action--delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onHideTag(tag);
                      }}
                      aria-label={t("tagExplorer.delete.aria", { tag })}
                      title={t("tagExplorer.delete.title")}
                    >
                      {Icon.trash()}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Admin "hidden-tags" section — only renders when the
            admin has actually hidden at least one tag AND we have a
            restore handler. Sits below the main list with a divider
            so admins can review what's been pruned and undo
            individually. */}
        {showHiddenSection && (
          <section className="tag-explorer-hidden">
            <h3 className="tag-explorer-hidden-heading">
              {t("tagExplorer.hidden.heading", { count: hiddenTags.length })}
            </h3>
            <ul className="tag-explorer-list">
              {hiddenTags.map((tag) => (
                <li key={tag} className="tag-explorer-row tag-explorer-row--hidden">
                  <span className="tag-explorer-chip tag-explorer-chip--hidden">
                    <span className="tag-explorer-name">{tag}</span>
                  </span>
                  <button
                    type="button"
                    className="tag-explorer-row-action tag-explorer-row-action--restore"
                    onClick={() => onRestoreTag?.(tag)}
                    aria-label={t("tagExplorer.restore.aria", { tag })}
                    title={t("tagExplorer.restore.title")}
                  >
                    {Icon.plus()}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </dialog>
  );
}
