"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CaseRecord } from "@/lib/types";

interface Props {
  caso: CaseRecord;
  /** Apply a partial override. Used to persist `focus` via the
   *  existing repo facade (local-first, mirrored to DB). */
  onPatch: (id: string, patch: Partial<CaseRecord>) => void;
  /** Live-preview hook. Called whenever the user mutates the draft;
   *  the parent passes the value to CineLoop's `focus` prop so the
   *  thumbnail reflects the in-progress edit without saving. Receives
   *  `undefined` when the editor closes / saves so the parent can
   *  drop back to the persisted focus. */
  onDraftChange?: (draft: { x: number; y: number; scale: number } | undefined) => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.1;
const PAN_STEP = 5;

/**
 * In-place focal-point + zoom editor for a thumbnail. Renders a `⚙`
 * chip on the card; clicking it expands an inline panel with arrow
 * pads (pan) and zoom controls. Applies the changes live (the
 * thumbnail behind the editor reflects the in-progress focus) and
 * commits via `onPatch` on Save.
 *
 * The external container (the card cell) is never resized — the
 * zoom is implemented as `transform: scale()` over an `object-fit:
 * cover` image, so the user is reframing what's visible inside the
 * fixed cell, not changing the cell itself.
 */
export default function FocusEditor({ caso, onPatch, onDraftChange }: Props) {
  const [open, setOpen] = useState(false);
  // Local draft that the editor mutates while open. Only on Save do
  // we push it through `onPatch`. Cancel discards.
  const [draft, setDraft] = useState({
    x: caso.focus?.x ?? 50,
    y: caso.focus?.y ?? 50,
    scale: caso.focus?.scale ?? 1,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Computed viewport coordinates so the panel can render via
  // `position: fixed` and escape the thumbnail's `overflow: hidden`.
  // See QuickReclassify for the same pattern.
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const PANEL_WIDTH = 240;
    const left = Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8);
    setCoords({ top: rect.bottom + 6, left: Math.max(8, left) });
  }, [open]);

  // Reset draft when the underlying case changes (e.g. the admin
  // navigated to a different filter and the same chip is now over a
  // different card).
  useEffect(() => {
    setDraft({
      x: caso.focus?.x ?? 50,
      y: caso.focus?.y ?? 50,
      scale: caso.focus?.scale ?? 1,
    });
  }, [caso.id, caso.focus?.x, caso.focus?.y, caso.focus?.scale]);

  // Notify the parent of the live draft. Sending `undefined` when the
  // editor closes lets the parent fall back to the persisted focus
  // so a Cancel cleanly snaps the thumbnail back to what was saved.
  useEffect(() => {
    if (!onDraftChange) return;
    if (open) {
      onDraftChange(draft);
    } else {
      onDraftChange(undefined);
    }
  }, [open, draft, onDraftChange]);

  // Close on outside click + escape, same pattern as QuickReclassify.
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      const node = panelRef.current;
      const trigger = triggerRef.current;
      const target = e.target as Node;
      if (node && node.contains(target)) return;
      if (trigger && trigger.contains(target)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", click), 0);
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", click);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const pan = (dx: number, dy: number) => {
    setDraft((d) => ({
      ...d,
      x: clamp(d.x + dx, 0, 100),
      y: clamp(d.y + dy, 0, 100),
    }));
  };
  const zoom = (delta: number) => {
    setDraft((d) => ({
      ...d,
      scale: clamp(roundTo(d.scale + delta, 1), MIN_SCALE, MAX_SCALE),
    }));
  };
  const reset = () => setDraft({ x: 50, y: 50, scale: 1 });

  const save = () => {
    // Drop the focus field entirely when it equals the defaults so
    // the override map doesn't carry redundant data.
    const isDefault = draft.x === 50 && draft.y === 50 && draft.scale === 1;
    onPatch(caso.id, { focus: isDefault ? undefined : draft });
    setOpen(false);
  };

  return (
    <div
      className="focus-editor"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className="focus-editor-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ajustar foco / tamaño de la miniatura"
        aria-expanded={open}
        title="Mover foco · cambiar zoom (no toca el contenedor)"
      >
        ⚙
      </button>

      {open && coords && typeof document !== "undefined"
        ? createPortal(
            // Same portal-to-body pattern as QuickReclassify: keeps the
            // panel's `position: fixed` honest by escaping the card's
            // `transform: translateY(-2px)` hover state, which would
            // otherwise re-anchor the panel to the card and make it
            // jitter every time the hover toggles.
            <div
              ref={panelRef}
              className="focus-editor-panel"
              role="dialog"
              aria-label="Ajustar foco"
              style={{ top: coords.top, left: coords.left }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
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
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn-primary" onClick={save}>
                  Guardar
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
