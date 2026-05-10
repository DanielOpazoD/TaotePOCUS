"use client";

// Reusable focus / zoom editor — five-way pan pad, ± zoom controls,
// Reset / Save action row. Originally lived inline inside
// `AdminThumbMenu.FocusInline` (per-case editor); extracted so the
// admin's `<FocusDefaultsPanel>` (global / per-section / per-category
// editor) can reuse the same widget without DRY drift.
//
// The component is purely visual + value-driven:
//
//   - `value` — current draft (controlled). The caller persists it
//     when "Save" is clicked.
//   - `onChange` — fires on every nudge so the parent can stream a
//     live preview to a thumbnail (the per-case editor uses this to
//     update the `<CineLoop>` while the editor is open).
//   - `onSave` — commits the current value. The caller decides what
//     "save" means in its scope (per-case override, global default, …).
//   - `onReset` — fires when the user clicks "Reset". The component
//     stages the reset internally (back to 50/50/1) AND tells the
//     parent so it can clear the live preview / mark its slot as
//     "use default".
//   - `onCancel` — optional. When provided, an inline ← Atrás button
//     surfaces above the controls. Used by the per-case dropdown so
//     the user can back out of the focus sub-view without committing.
//
// All ranges and step sizes match the legacy per-case editor so the
// two surfaces feel identical to muscle memory.

import { useEffect, useState } from "react";
import { useT } from "@/hooks/useLanguage";
import type { FocusValue } from "@/lib/types";

interface Props {
  /** Initial / controlled value. The component clones this into local
   *  draft state on mount; `value` is treated as the persisted slot. */
  value: FocusValue | undefined;
  /** Stream every keystroke so the parent can render a live preview.
   *  Receives `undefined` whenever the editor unmounts so the parent
   *  can drop its preview cleanly. */
  onChange?: (next: FocusValue | undefined) => void;
  /** Commit the current draft to the persisted slot. The component
   *  collapses centered + 100% drafts to `undefined` so a
   *  "save with default values" call clears the slot rather than
   *  pinning a redundant `{ x:50, y:50, scale:1 }`. */
  onSave: (next: FocusValue | undefined) => void;
  /** Optional dedicated reset callback. Fires alongside the local
   *  draft reset so the parent can also clear its preview. */
  onReset?: () => void;
  /** Optional back affordance. Renders the ← Atrás button when
   *  provided; omitted in the global panel where the editor is
   *  always visible inline. */
  onCancel?: () => void;
}

const PAN_STEP = 5;
const SCALE_STEP = 0.1;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

/** Round to 1 decimal place — keeps the displayed scale value stable
 *  across additive +/- nudges (no floating-point creep). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Resolve the renderer's hardcoded defaults into a fully-populated
 *  draft. The component always works against a complete shape so the
 *  pan / zoom math doesn't have to handle missing keys. */
function fill(value: FocusValue | undefined): { x: number; y: number; scale: number } {
  return {
    x: value?.x ?? 50,
    y: value?.y ?? 50,
    scale: value?.scale ?? 1,
  };
}

export default function FocusEditor({ value, onChange, onSave, onReset, onCancel }: Props) {
  const t = useT();
  const [draft, setDraft] = useState(() => fill(value));

  // Stream the live preview to the parent. Cleanup on unmount clears
  // the preview so a sibling re-render after closing doesn't keep
  // stale draft state visible.
  useEffect(() => {
    onChange?.(draft);
    return () => onChange?.(undefined);
  }, [draft, onChange]);

  const pan = (dx: number, dy: number) =>
    setDraft((d) => ({
      ...d,
      x: clamp(d.x + dx, 0, 100),
      y: clamp(d.y + dy, 0, 100),
    }));
  const zoom = (delta: number) =>
    setDraft((d) => ({
      ...d,
      scale: clamp(round1(d.scale + delta), MIN_SCALE, MAX_SCALE),
    }));
  const center = () => setDraft((d) => ({ ...d, x: 50, y: 50 }));
  const reset = () => {
    setDraft({ x: 50, y: 50, scale: 1 });
    onReset?.();
  };
  const save = () => {
    const isDefault = draft.x === 50 && draft.y === 50 && draft.scale === 1;
    onSave(isDefault ? undefined : draft);
  };

  return (
    <div className="focus-editor">
      {onCancel && (
        <button type="button" className="admin-thumb-menu-back" onClick={onCancel}>
          ← {t("focus.editor.back")}
        </button>
      )}
      <div className="focus-editor-row">
        <span className="focus-editor-label">{t("focus.editor.foco")}</span>
        <div className="focus-editor-pad">
          <button
            type="button"
            aria-label={t("focus.editor.aria.up")}
            onClick={() => pan(0, -PAN_STEP)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={t("focus.editor.aria.left")}
            onClick={() => pan(-PAN_STEP, 0)}
          >
            ←
          </button>
          <button
            type="button"
            aria-label={t("focus.editor.aria.center")}
            onClick={center}
            title={t("focus.editor.aria.center")}
          >
            ●
          </button>
          <button
            type="button"
            aria-label={t("focus.editor.aria.right")}
            onClick={() => pan(PAN_STEP, 0)}
          >
            →
          </button>
          <button
            type="button"
            aria-label={t("focus.editor.aria.down")}
            onClick={() => pan(0, PAN_STEP)}
          >
            ↓
          </button>
        </div>
      </div>
      <div className="focus-editor-row">
        <span className="focus-editor-label">{t("focus.editor.zoom")}</span>
        <div className="focus-editor-zoom">
          <button
            type="button"
            aria-label={t("focus.editor.aria.zoomOut")}
            onClick={() => zoom(-SCALE_STEP)}
          >
            −
          </button>
          <span className="focus-editor-zoom-value">{Math.round(draft.scale * 100)}%</span>
          <button
            type="button"
            aria-label={t("focus.editor.aria.zoomIn")}
            onClick={() => zoom(SCALE_STEP)}
          >
            +
          </button>
        </div>
      </div>
      <div className="focus-editor-actions">
        <button type="button" className="btn-ghost focus-editor-reset" onClick={reset}>
          {t("focus.editor.reset")}
        </button>
        <button type="button" className="btn-primary" onClick={save}>
          {t("focus.editor.save")}
        </button>
      </div>
    </div>
  );
}
