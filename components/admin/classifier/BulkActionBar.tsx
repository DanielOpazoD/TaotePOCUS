"use client";

// Bottom-fixed pill that surfaces when the multi-select set on the
// classifier board is non-empty. Hosts the bulk operations the
// admin reaches for after lassoing a group of cases.
//
// Affordances (left → right):
//   - Counter ("12 seleccionados")
//   - "Marcar revisado" / "Quitar revisado"
//   - Section dropdown (apply to all)
//   - Category dropdown (apply to all)
//   - Soft-delete (single click — the bulk gesture + the undo
//     toast are the safety net, no per-card confirm dialog)
//   - "Limpiar"
//
// Bulk PURGE is intentionally absent — irreversible by design,
// the per-card confirm dialog stays the only path. Bulk-purging 50
// cases by mistake is the kind of slip we don't want to make easy.
//
// Pulled out of `ClassifierBoard.tsx` in May-2026 alongside the
// drag-controller / hint-pill split: the bar has its own internal
// state (the two pending-target dropdowns) so it deserves its own
// file even though it's tightly coupled to the board's selection.

import { useState } from "react";
import { SECTIONS } from "@/lib/data";
import type { CaseRecord, Category, SectionId } from "@/lib/types";

interface Props {
  count: number;
  ids: string[];
  categories: Category[];
  onClear: () => void;
  onBulkPatch?: (ids: string[], patch: Partial<CaseRecord>) => void;
  onBulkSoftDelete?: (ids: string[]) => void;
  /** Called after any successful bulk operation. Used by the parent
   *  to reset the selection set so the bar collapses cleanly. */
  afterAction: () => void;
}

export function BulkActionBar({
  count,
  ids,
  categories,
  onClear,
  onBulkPatch,
  onBulkSoftDelete,
  afterAction,
}: Props) {
  const ANY_TARGET = "__pick__";
  const [sectionTarget, setSectionTarget] = useState<string>(ANY_TARGET);
  const [categoryTarget, setCategoryTarget] = useState<string>(ANY_TARGET);

  const apply = (patch: Partial<CaseRecord>) => {
    if (!onBulkPatch) return;
    onBulkPatch(ids, patch);
    afterAction();
  };

  return (
    <div className="classifier-bulk" role="region" aria-label="Acciones en lote">
      <div className="classifier-bulk-count">
        <strong>{count}</strong> seleccionado{count === 1 ? "" : "s"}
      </div>
      <div className="classifier-bulk-actions">
        {onBulkPatch && (
          <>
            <button
              type="button"
              className="classifier-bulk-btn"
              onClick={() => apply({ reviewed: true })}
              title="Marcar todos como revisados"
            >
              ✓ Marcar revisado
            </button>
            <button
              type="button"
              className="classifier-bulk-btn"
              onClick={() => apply({ reviewed: false })}
              title="Quitar marca de revisado a todos"
            >
              Quitar revisado
            </button>
            <label className="classifier-bulk-select">
              <span className="sr-only">Mover sección a</span>
              <select
                value={sectionTarget}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === ANY_TARGET) return;
                  apply({ section: v as SectionId });
                  setSectionTarget(ANY_TARGET);
                }}
              >
                <option value={ANY_TARGET}>Mover sección…</option>
                {SECTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="classifier-bulk-select">
              <span className="sr-only">Mover categoría a</span>
              <select
                value={categoryTarget}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === ANY_TARGET) return;
                  apply({ category: v });
                  setCategoryTarget(ANY_TARGET);
                }}
              >
                <option value={ANY_TARGET}>Mover categoría…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {onBulkSoftDelete && (
          <button
            type="button"
            className="classifier-bulk-btn classifier-bulk-btn--danger"
            onClick={() => {
              onBulkSoftDelete(ids);
              afterAction();
            }}
            title="Mover los seleccionados a la papelera"
          >
            🗑 Mover a papelera
          </button>
        )}
      </div>
      <button
        type="button"
        className="classifier-bulk-clear"
        onClick={onClear}
        title="Limpiar selección · Esc"
      >
        Limpiar
      </button>
    </div>
  );
}
