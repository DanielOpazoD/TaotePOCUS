"use client";

// Saved views dropdown — sits in the Toolbar next to the search /
// sort cluster. The trigger is a small star button; clicking opens
// a popover with two sections:
//
//   1. "Save current view" — input + button, captures the current
//      `ViewState` under the typed name.
//   2. List of saved views — click a row to apply (navigates),
//      click the trailing × to delete. Newest at top.
//
// Click-outside + ESC dismiss; the menu closes after applying a
// view (the user wants to read the catalog they just navigated to,
// not stare at the dropdown). Saving stays open so the admin can
// fire several saves in a row when wiring up presets the first time.

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/hooks/useLanguage";
import { useSavedViews } from "@/hooks/useSavedViews";
import { viewHref, type SavedView } from "@/lib/saved-views";
import type { ViewState } from "@/lib/url";

interface Props {
  /** Current view state — captured into a saved view when the
   *  admin types a name and clicks "Save current". The orchestrator
   *  threads `useViewState`'s return through here. */
  state: ViewState;
  /** Toast surface for "Vista guardada" / "Vista eliminada"
   *  feedback. Wired to App.tsx's `showToast`. */
  notify?: (message: string) => void;
}

/** Star (saved) icon. Inline SVG to match the header / toolbar
 *  iconography (24×24 viewBox, 1.5 stroke, currentColor). */
function StarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

/** Small × glyph for the row delete button — separate from the
 *  global Icon module because this one needs a thinner stroke to
 *  read as a "remove" cue inside the small popover row. */
function RemoveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function SavedViewsMenu({ state, notify }: Props) {
  const t = useT();
  const router = useRouter();
  const { views, saveCurrent, removeView } = useSavedViews();
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Outside-click + Escape dismiss. Same pattern as the
  // LanguageSwitcher — listeners are only installed while the menu
  // is open so a closed menu has zero passive cost.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onSave = () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      notify?.(t("savedViews.toast.invalidName"));
      return;
    }
    const created = saveCurrent(state, trimmed);
    if (created) {
      setDraftName("");
      notify?.(t("savedViews.toast.saved", { name: created.name }));
    }
  };

  const onApply = (view: SavedView) => {
    setOpen(false);
    router.push(viewHref(view), { scroll: true });
  };

  const onDelete = (view: SavedView) => {
    removeView(view.id);
    notify?.(t("savedViews.toast.removed"));
  };

  return (
    <div className="saved-views" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className="saved-views-trigger"
        aria-label={t("savedViews.trigger.aria")}
        title={t("savedViews.trigger.title")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <StarIcon />
        <span className="saved-views-trigger-label">{t("savedViews.trigger.label")}</span>
        {views.length > 0 && (
          <span className="saved-views-trigger-count" aria-hidden="true">
            {views.length}
          </span>
        )}
      </button>
      {open && (
        <div
          id={menuId}
          className="saved-views-menu"
          role="menu"
          aria-label={t("savedViews.menu.aria")}
          // Stop propagation so a click inside the menu doesn't
          // re-fire the outside-click handler before the action runs.
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h4 className="saved-views-heading">{t("savedViews.heading")}</h4>
          {views.length === 0 ? (
            <p className="saved-views-empty">{t("savedViews.empty")}</p>
          ) : (
            <ul className="saved-views-list">
              {views.map((view) => (
                <li key={view.id} className="saved-views-row">
                  <button
                    type="button"
                    className="saved-views-row-apply"
                    role="menuitem"
                    aria-label={t("savedViews.row.apply", { name: view.name })}
                    onClick={() => onApply(view)}
                  >
                    <span className="saved-views-row-name">{view.name}</span>
                    <span className="saved-views-row-href" aria-hidden="true">
                      {view.path}
                      {view.search && "?…"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="saved-views-row-delete"
                    aria-label={t("savedViews.row.delete", { name: view.name })}
                    onClick={() => onDelete(view)}
                  >
                    <RemoveIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="saved-views-save"
            onSubmit={(e) => {
              e.preventDefault();
              onSave();
            }}
          >
            <input
              type="text"
              className="saved-views-save-input"
              placeholder={t("savedViews.save.placeholder")}
              aria-label={t("savedViews.save.aria")}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={48}
            />
            <button
              type="submit"
              className="btn-primary saved-views-save-submit"
              disabled={!draftName.trim()}
            >
              {t("savedViews.save.submit")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
