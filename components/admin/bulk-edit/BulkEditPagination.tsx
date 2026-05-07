"use client";

// Pagination footer for `BulkEditTable`. Two simple buttons +
// position indicator. Hidden when totalPages ≤ 1 (the parent
// returns `null` from the JSX site so this component never sees
// the redundant single-page state).

interface Props {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

export function BulkEditPagination({ page, totalPages, onPrev, onNext }: Props) {
  return (
    <div className="bulk-edit-pagination">
      <button
        type="button"
        className="btn-ghost"
        onClick={onPrev}
        disabled={page === 0}
        aria-label="Página anterior"
      >
        ← Anterior
      </button>
      <span className="bulk-edit-page-indicator">
        Página {page + 1} de {totalPages}
      </span>
      <button
        type="button"
        className="btn-ghost"
        onClick={onNext}
        disabled={page >= totalPages - 1}
        aria-label="Página siguiente"
      >
        Siguiente →
      </button>
    </div>
  );
}
