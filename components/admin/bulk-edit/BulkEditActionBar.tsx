"use client";

// Sticky action bar that appears at the bottom of `BulkEditTable`
// once one or more rows are selected. Hosts the bulk operations:
// reclassify (section / category), mark / unmark reviewed, delete,
// clear selection.
//
// Visually styled as an inverted pill that floats above the page
// — matches the toast geometry but with a different palette so the
// admin can distinguish "info / undo" from "this is a tool you're
// actively using". Stays out of the way until selection > 0.

import { Icon } from "@/lib/icons";
import { SECTIONS } from "@/lib/data";
import type { Category, SectionId } from "@/lib/types";

interface Props {
  selectedCount: number;
  categories: Category[];
  onApplySection: (s: SectionId) => void;
  onApplyCategory: (id: string) => void;
  onApplyReviewed: (reviewed: boolean) => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkEditActionBar({
  selectedCount,
  categories,
  onApplySection,
  onApplyCategory,
  onApplyReviewed,
  onDelete,
  onClear,
}: Props) {
  return (
    <div className="bulk-edit-actionbar" role="toolbar" aria-label="Acciones en lote">
      <span className="bulk-edit-actionbar-count">
        {selectedCount} seleccionado{selectedCount === 1 ? "" : "s"}
      </span>
      <select
        className="bulk-edit-filter"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            onApplySection(e.target.value as SectionId);
            e.target.value = "";
          }
        }}
        aria-label="Cambiar sección de seleccionados"
      >
        <option value="">Cambiar sección…</option>
        {SECTIONS.map((s) => (
          <option key={s.id} value={s.id}>
            → {s.label}
          </option>
        ))}
      </select>
      <select
        className="bulk-edit-filter"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            onApplyCategory(e.target.value);
            e.target.value = "";
          }
        }}
        aria-label="Cambiar categoría de seleccionados"
      >
        <option value="">Cambiar categoría…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            → {c.label}
          </option>
        ))}
      </select>
      <button type="button" className="btn-ghost" onClick={() => onApplyReviewed(true)}>
        ✓ Marcar revisado
      </button>
      <button type="button" className="btn-ghost" onClick={() => onApplyReviewed(false)}>
        ✗ Sin marcar
      </button>
      <button type="button" className="btn-danger bulk-edit-actionbar-delete" onClick={onDelete}>
        {Icon.trash()} Eliminar
      </button>
      <button type="button" className="btn-ghost" onClick={onClear}>
        Limpiar
      </button>
    </div>
  );
}
