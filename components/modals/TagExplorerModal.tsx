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
  // Collapsible "etiquetas ocultas" section. Default CLOSED so the
  // active list (the primary surface) stays above the fold even
  // when there are many hidden tags. The header row remains visible
  // as a count summary; click expands. PR #156 shipped this section
  // always-open which pushed the active list off-screen once the
  // admin hid >15 tags.
  const [hiddenExpanded, setHiddenExpanded] = useState(false);
  // Inline confirm step before destroying the tag's visibility
  // across every case. Stores the pending tag id; the row morphs
  // to "¿Confirmar? Sí | Cancelar" while pending. One pending row
  // at a time — clicking a different row's delete cancels the
  // previous pending state.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

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
              const isPending = pendingDelete === tag;
              if (isPending && onHideTag) {
                // Inline confirm — the row morphs into a destructive
                // prompt so the admin acknowledges that hiding the
                // tag cascades to every case using it. One click
                // away from a real cross-corpus change.
                return (
                  <li key={tag} className="tag-explorer-row tag-explorer-row--confirm">
                    <span
                      className="tag-explorer-confirm-message"
                      title={t("tagExplorer.deleteConfirm.title", { tag })}
                    >
                      {t("tagExplorer.deleteConfirm.message", { tag })}
                    </span>
                    <button
                      type="button"
                      className="tag-explorer-row-action tag-explorer-row-action--confirm-yes"
                      onClick={() => {
                        onHideTag(tag);
                        setPendingDelete(null);
                      }}
                      aria-label={t("tagExplorer.deleteConfirm.yes.aria")}
                      title={t("tagExplorer.deleteConfirm.yes.title")}
                    >
                      {t("tagExplorer.deleteConfirm.yes.label")}
                    </button>
                    <button
                      type="button"
                      className="tag-explorer-row-action tag-explorer-row-action--confirm-no"
                      onClick={() => setPendingDelete(null)}
                      aria-label={t("tagExplorer.deleteConfirm.no.aria")}
                      title={t("tagExplorer.deleteConfirm.no.title")}
                    >
                      {t("tagExplorer.deleteConfirm.no.label")}
                    </button>
                  </li>
                );
              }
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
                  {/* Admin-only delete button. Doesn't fire the
                      destructive op directly — it sets the row's
                      `pendingDelete` state so the row morphs into
                      a confirm prompt (above). The two-step ack
                      protects against accidental clicks on a
                      cascade-destructive control. */}
                  {onHideTag && (
                    <button
                      type="button"
                      className="tag-explorer-row-action tag-explorer-row-action--delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(tag);
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
            restore handler. Default COLLAPSED so the active list
            (the primary surface) stays above the fold even with
            many hidden tags. The header doubles as the toggle so
            a curious admin can expand it; the count summary stays
            visible regardless. */}
        {showHiddenSection && (
          <section className={`tag-explorer-hidden${hiddenExpanded ? " is-expanded" : ""}`}>
            <button
              type="button"
              className="tag-explorer-hidden-heading"
              onClick={() => setHiddenExpanded((v) => !v)}
              aria-expanded={hiddenExpanded}
              aria-controls="tag-explorer-hidden-list"
            >
              <span className="tag-explorer-hidden-chevron" aria-hidden="true">
                {hiddenExpanded ? "▾" : "▸"}
              </span>
              <span>{t("tagExplorer.hidden.heading", { count: hiddenTags.length })}</span>
            </button>
            {hiddenExpanded && (
              <ul className="tag-explorer-list" id="tag-explorer-hidden-list">
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
            )}
          </section>
        )}
      </div>
    </dialog>
  );
}
