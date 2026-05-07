"use client";

// Generic click-to-edit text cell used in `BulkEditTable` for
// title (single-line) and description (multi-line) columns.
//
// Display state: the cell is a quiet button that the admin can
// click to enter edit mode. On hover it picks up a subtle border +
// surface tint so the affordance is obvious without shouting.
//
// Edit state: an `<input>` (or `<textarea>` if `multiline`) takes
// focus immediately. Esc cancels and reverts the draft; blur
// commits if the value changed. Plain Enter commits on single-line
// inputs; on multi-line textareas, plain Enter inserts a newline
// and Cmd/Ctrl+Enter commits — same shortcut admins would expect
// from any other rich-textarea editor.
//
// Save flash: on a successful commit the display button briefly
// pulses with the accent-soft fill so the admin sees the write
// landed without a per-edit toast. Failure is surfaced by the
// parent's toast layer.

import { useEffect, useState } from "react";

interface Props {
  value: string;
  ariaLabel: string;
  multiline?: boolean;
  onSave: (next: string) => Promise<void> | void;
}

export function BulkEditEditableText({ value, ariaLabel, multiline, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Keep `draft` in sync when the source value changes externally
  // (e.g., parent re-renders with a fresher `caso.title` after a
  // server-confirmed save).
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 800);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={
          "bulk-edit-cell-display" +
          (multiline ? " is-multiline" : "") +
          (savedFlash ? " is-saved-flash" : "")
        }
        aria-label={`${ariaLabel} (click para editar)`}
        onClick={() => setEditing(true)}
      >
        {value || <span className="bulk-edit-cell-empty">— vacío —</span>}
      </button>
    );
  }

  if (multiline) {
    return (
      <textarea
        autoFocus
        className="bulk-edit-cell-input is-multiline"
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
          // Cmd/Ctrl + Enter saves; plain Enter inserts newline.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
        }}
        aria-label={ariaLabel}
        disabled={saving}
      />
    );
  }
  return (
    <input
      autoFocus
      type="text"
      className="bulk-edit-cell-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        }
      }}
      aria-label={ariaLabel}
      disabled={saving}
    />
  );
}
