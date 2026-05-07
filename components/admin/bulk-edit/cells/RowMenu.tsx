"use client";

// Per-row action menu (⋮) for `BulkEditTable`. Hosts:
//
//   - "Abrir modal completo" — mounts the full CaseForm for fields
//     the table doesn't expose (media, focus, loop, difficulty,
//     lastUpdated).
//   - "Eliminar caso" — single-row soft delete.
//
// Both are gated by the parent passing the corresponding callback;
// when neither is provided the trigger doesn't render at all (the
// row's actions cell collapses to empty).
//
// Keyboard: Esc closes the popover. Click outside closes (handled
// via a window mousedown listener installed only while open so
// passive viewing has no extra cost).

import { useEffect, useRef, useState } from "react";
import type { CaseRecord } from "@/lib/types";

interface Props {
  caso: CaseRecord;
  onOpenEdit?: (c: CaseRecord) => void;
  onDelete?: (c: CaseRecord) => void;
}

export function BulkEditRowMenu({ caso, onOpenEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!onOpenEdit && !onDelete) return null;

  return (
    <div className="bulk-edit-rowmenu" ref={ref}>
      <button
        type="button"
        className="bulk-edit-rowmenu-trigger"
        aria-label="Más acciones"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋮
      </button>
      {open && (
        <div className="bulk-edit-rowmenu-panel" role="menu">
          {onOpenEdit && (
            <button
              type="button"
              className="bulk-edit-rowmenu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenEdit(caso);
              }}
            >
              Abrir modal completo
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="bulk-edit-rowmenu-item bulk-edit-rowmenu-item--danger"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete(caso);
              }}
            >
              Eliminar caso
            </button>
          )}
        </div>
      )}
    </div>
  );
}
