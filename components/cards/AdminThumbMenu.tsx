"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/lib/icons";
import { IMPORT_MARKER_TAG, SECTIONS } from "@/lib/data";
import { categoryLabelEs } from "@/lib/i18n";
import type { CaseRecord, Category } from "@/lib/types";

interface Props {
  caso: CaseRecord;
  /** Categories list (built-in + custom) for the reclassify popover. */
  categories: Category[];
  /** Apply a partial override (used by reclassify + focus). */
  onPatch: (id: string, patch: Partial<CaseRecord>) => void;
  /** Soft-delete (parent shows confirm dialog). */
  onDelete?: () => void;
  /** Permanent-delete (parent shows confirm dialog). */
  onPurge?: () => void;
  /** Live-preview channel for the focus editor (matches what
   *  `<FocusEditor>` already exposes). */
  onFocusDraftChange?: (draft: { x: number; y: number; scale: number } | undefined) => void;
}

type View = "menu" | "reclassify" | "focus";

/**
 * Single admin entry point on every thumbnail. Replaces the four
 * separate chips that used to crowd the corner of every card
 * (delete / permanent-delete / reclassify / focus). One `⋮` button;
 * clicking it opens a dropdown with all admin actions, and the two
 * with sub-panels (reclassify, focus) pivot the dropdown into inline
 * versions of those panels.
 *
 * Why one menu instead of N chips:
 *   - Less visual noise — admin grids stay legible.
 *   - Fewer hover gotchas — only one element to position-clip /
 *     event-stop / portal out of the card.
 *   - One source of truth for the stopPropagation semantics.
 *
 * The menu portals to `document.body` to escape any transformed
 * ancestor (cards apply `transform: translateY(-2px)` on hover,
 * which would otherwise capture our `position: fixed` panel and
 * make it jitter on hover changes).
 */
export default function AdminThumbMenu({
  caso,
  categories,
  onPatch,
  onDelete,
  onPurge,
  onFocusDraftChange,
}: Props) {
  const [open, setOpen] = useState(false);
  // When the menu opens, it always starts on the action list. Picking
  // "Reclasificar" or "Ajustar foco" pivots to that sub-view; closing
  // and re-opening starts at the menu again.
  const [view, setView] = useState<View>("menu");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  // Compute viewport-relative coords on open. Same rationale as the
  // previous popovers: `position: fixed` + portal so the menu stays
  // put through hover-driven card transforms.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const MENU_WIDTH = 240;
    const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8);
    setCoords({ top: rect.bottom + 6, left: Math.max(8, left) });
  }, [open, view]);

  // Outside click + Escape close the entire menu — including any open
  // sub-panel. The trigger button is exempted so its click-to-toggle
  // doesn't race with the close-handler.
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      const node = menuRef.current;
      const trigger = triggerRef.current;
      const target = e.target as Node;
      if (node && node.contains(target)) return;
      if (trigger && trigger.contains(target)) return;
      setOpen(false);
      setView("menu");
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Inside a sub-panel, Escape returns to the menu; from the
        // menu, Escape closes everything.
        if (view !== "menu") setView("menu");
        else {
          setOpen(false);
          setView("menu");
        }
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", click), 0);
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", click);
      document.removeEventListener("keydown", key);
    };
  }, [open, view]);

  const closeAll = () => {
    setOpen(false);
    setView("menu");
  };

  const handleDelete = () => {
    closeAll();
    onDelete?.();
  };
  const handlePurge = () => {
    closeAll();
    onPurge?.();
  };

  // Reclassify and Focus open inline as sub-views inside the same
  // dropdown space. The reclassify and focus components already
  // handle their own portal — but here we render their action surface
  // directly inside the menu portal so the user sees one popover at
  // a time.
  return (
    <div
      className="admin-thumb-menu"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className="admin-thumb-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Acciones admin"
        aria-expanded={open}
        title="Acciones admin (reclasificar · foco · eliminar)"
      >
        ⋮
      </button>

      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="admin-thumb-menu-panel"
              role="menu"
              aria-label="Acciones de la miniatura"
              style={{ top: coords.top, left: coords.left }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {view === "menu" && (
                <ul className="admin-thumb-menu-list">
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      className="admin-thumb-menu-item"
                      onClick={() => setView("reclassify")}
                    >
                      <span className="admin-thumb-menu-glyph" aria-hidden="true">
                        ⇄
                      </span>
                      Reclasificar
                      <span className="admin-thumb-menu-meta">
                        {caso.section} ·{" "}
                        {(() => {
                          const cat = categories.find((c) => c.id === caso.category);
                          return cat ? categoryLabelEs(cat) : caso.category;
                        })()}
                      </span>
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      className="admin-thumb-menu-item"
                      onClick={() => setView("focus")}
                    >
                      <span className="admin-thumb-menu-glyph" aria-hidden="true">
                        ⚙
                      </span>
                      Ajustar foco / zoom
                    </button>
                  </li>
                  {(onDelete || onPurge) && (
                    <li className="admin-thumb-menu-sep" role="separator" />
                  )}
                  {onDelete && (
                    <li>
                      <button
                        type="button"
                        role="menuitem"
                        className="admin-thumb-menu-item admin-thumb-menu-item--danger-soft"
                        onClick={handleDelete}
                      >
                        <span className="admin-thumb-menu-glyph" aria-hidden="true">
                          {Icon.trash()}
                        </span>
                        Mover a papelera
                      </button>
                    </li>
                  )}
                  {onPurge && (
                    <li>
                      <button
                        type="button"
                        role="menuitem"
                        className="admin-thumb-menu-item admin-thumb-menu-item--danger"
                        onClick={handlePurge}
                      >
                        <span className="admin-thumb-menu-glyph" aria-hidden="true">
                          ✕
                        </span>
                        Eliminar permanentemente
                      </button>
                    </li>
                  )}
                </ul>
              )}

              {view === "reclassify" && (
                // The existing component already implements the
                // section/category lists and the `Sin clasificar` tag
                // strip. We host its inline content here by mounting
                // it auto-opened — this works because it stays inside
                // its own portal but uses our trigger position. To
                // simplify, we just render the same UI inline.
                <ReclassifyInline
                  caso={caso}
                  categories={categories}
                  onPatch={(id, patch) => {
                    onPatch(id, patch);
                    closeAll();
                  }}
                  onBack={() => setView("menu")}
                />
              )}

              {view === "focus" && (
                <FocusInline
                  caso={caso}
                  onPatch={(id, patch) => {
                    onPatch(id, patch);
                    closeAll();
                  }}
                  onDraftChange={onFocusDraftChange}
                  onBack={() => setView("menu")}
                />
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

// ─── Inline sub-panels ──────────────────────────────────────────
//
// Reclassify and Focus render inline inside the menu's portal — same
// UI as their previous standalone form, but living in this single
// file so AdminThumbMenu is the canonical (and only) admin entry on
// the thumbnail.

function ReclassifyInline({
  caso,
  categories,
  onPatch,
  onBack,
}: {
  caso: CaseRecord;
  categories: Category[];
  onPatch: (id: string, patch: Partial<CaseRecord>) => void;
  onBack: () => void;
}) {
  // Sourced from the central catalog so adding a new section
  // (e.g. "rayos") shows up here automatically — was hardcoded
  // until May-2026 and the rayos addition exposed the drift.
  const SECTIONS_INLINE: Array<{ id: CaseRecord["section"]; label: string }> = SECTIONS.map(
    (s) => ({ id: s.id, label: s.label }),
  );
  const apply = (patch: Partial<CaseRecord>) => {
    // Match drag-drop semantics: any classification decision strips
    // the import-time `Sin clasificar` tag from BOTH language slots.
    // The marker is bilingual because we want the classifier to clean
    // up both lists in one move; the EN list (if present) gets the
    // same filter pass.
    const cleanedEs = caso.tags.es.filter((t) => t !== IMPORT_MARKER_TAG);
    const cleanedEn = caso.tags.en?.filter((t) => t !== IMPORT_MARKER_TAG);
    const nextTags: CaseRecord["tags"] =
      cleanedEn && cleanedEn.length > 0 ? { es: cleanedEs, en: cleanedEn } : { es: cleanedEs };
    onPatch(caso.id, { ...patch, tags: nextTags });
  };
  return (
    <div className="admin-thumb-menu-sub">
      <button type="button" className="admin-thumb-menu-back" onClick={onBack}>
        ← Atrás
      </button>
      <div className="admin-thumb-menu-group-label">Sección</div>
      {SECTIONS_INLINE.map((s) => (
        <button
          key={s.id}
          type="button"
          role="menuitemradio"
          aria-checked={caso.section === s.id}
          className={`admin-thumb-menu-item${caso.section === s.id ? " is-active" : ""}`}
          onClick={() => apply({ section: s.id })}
        >
          <span className="admin-thumb-menu-check" aria-hidden="true">
            {caso.section === s.id ? "✓" : ""}
          </span>
          {s.label}
        </button>
      ))}
      <div className="admin-thumb-menu-sep" role="separator" />
      <div className="admin-thumb-menu-group-label">Categoría</div>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          role="menuitemradio"
          aria-checked={caso.category === c.id}
          className={`admin-thumb-menu-item${caso.category === c.id ? " is-active" : ""}`}
          onClick={() => apply({ category: c.id })}
        >
          <span className="admin-thumb-menu-check" aria-hidden="true">
            {caso.category === c.id ? "✓" : ""}
          </span>
          {categoryLabelEs(c)}
        </button>
      ))}
    </div>
  );
}

function FocusInline({
  caso,
  onPatch,
  onDraftChange,
  onBack,
}: {
  caso: CaseRecord;
  onPatch: (id: string, patch: Partial<CaseRecord>) => void;
  onDraftChange?: (draft: { x: number; y: number; scale: number } | undefined) => void;
  onBack: () => void;
}) {
  const PAN_STEP = 5;
  const SCALE_STEP = 0.1;
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3;
  const [draft, setDraft] = useState({
    x: caso.focus?.x ?? 50,
    y: caso.focus?.y ?? 50,
    scale: caso.focus?.scale ?? 1,
  });
  // Stream the live preview to the parent CaseCard so the thumbnail
  // reflects the in-progress edit. Clear when this sub-panel
  // unmounts (the caller handles Cancel by switching views).
  useEffect(() => {
    onDraftChange?.(draft);
    return () => onDraftChange?.(undefined);
  }, [draft, onDraftChange]);

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const pan = (dx: number, dy: number) =>
    setDraft((d) => ({ ...d, x: clamp(d.x + dx, 0, 100), y: clamp(d.y + dy, 0, 100) }));
  const zoom = (delta: number) =>
    setDraft((d) => ({ ...d, scale: clamp(round1(d.scale + delta), MIN_SCALE, MAX_SCALE) }));
  const reset = () => setDraft({ x: 50, y: 50, scale: 1 });
  const save = () => {
    const isDefault = draft.x === 50 && draft.y === 50 && draft.scale === 1;
    onPatch(caso.id, { focus: isDefault ? undefined : draft });
  };

  return (
    <div className="admin-thumb-menu-sub focus-inline">
      <button type="button" className="admin-thumb-menu-back" onClick={onBack}>
        ← Atrás
      </button>
      <div className="focus-editor-row">
        <span className="focus-editor-label">Foco</span>
        <div className="focus-editor-pad">
          <button type="button" aria-label="Subir" onClick={() => pan(0, -PAN_STEP)}>
            ↑
          </button>
          <button type="button" aria-label="Izquierda" onClick={() => pan(-PAN_STEP, 0)}>
            ←
          </button>
          <button
            type="button"
            aria-label="Centrar"
            onClick={() => setDraft((d) => ({ ...d, x: 50, y: 50 }))}
            title="Centrar"
          >
            ●
          </button>
          <button type="button" aria-label="Derecha" onClick={() => pan(PAN_STEP, 0)}>
            →
          </button>
          <button type="button" aria-label="Bajar" onClick={() => pan(0, PAN_STEP)}>
            ↓
          </button>
        </div>
      </div>
      <div className="focus-editor-row">
        <span className="focus-editor-label">Zoom</span>
        <div className="focus-editor-zoom">
          <button type="button" aria-label="Reducir" onClick={() => zoom(-SCALE_STEP)}>
            −
          </button>
          <span className="focus-editor-zoom-value">{Math.round(draft.scale * 100)}%</span>
          <button type="button" aria-label="Aumentar" onClick={() => zoom(SCALE_STEP)}>
            +
          </button>
        </div>
      </div>
      <div className="focus-editor-actions">
        <button type="button" className="btn-ghost focus-editor-reset" onClick={reset}>
          Reset
        </button>
        <button type="button" className="btn-primary" onClick={save}>
          Guardar
        </button>
      </div>
    </div>
  );
}
