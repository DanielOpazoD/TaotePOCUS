"use client";

// Pagination control for the public catalog grid. Sits below the
// `case-grid` and surfaces:
//   - "Mostrando X–Y de Z" copy.
//   - Page indicator ("Página 3 de 11").
//   - Prev / Next buttons.
//   - First / Last shortcuts when total pages > 5.
//
// Renders nothing when there's only a single page — pagination
// chrome at that scale reads as clutter.
//
// State lives in the parent (URL via useViewState). This component
// is purely presentational + wires button clicks to the
// `onPageChange` callback.

interface Props {
  /** 0-indexed current page. */
  page: number;
  /** Total number of pages (>= 1). */
  totalPages: number;
  /** Total number of items across all pages — drives the
   *  "Mostrando X–Y de Z" copy. */
  total: number;
  /** Items per page — used by the same copy. */
  pageSize: number;
  /** Page-change callback. Receives a 0-indexed page; the parent
   *  is responsible for clamping if it ever passes invalid values
   *  (this component already clamps internally). */
  onPageChange: (page: number) => void;
}

export function CatalogPagination({ page, totalPages, total, pageSize, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  // Clamp the displayed range to the actual count so the last
  // page reads "Mostrando 301–326 de 326" instead of overshooting.
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  const onPrev = () => {
    if (page > 0) onPageChange(page - 1);
  };
  const onNext = () => {
    if (page < totalPages - 1) onPageChange(page + 1);
  };
  const onFirst = () => onPageChange(0);
  const onLast = () => onPageChange(totalPages - 1);

  // Short pages keep just prev / next + indicator. Long pages
  // expose first / last shortcuts so the user can jump without
  // tabbing through a dozen "next" clicks.
  const showJumps = totalPages > 5;

  return (
    <nav className="catalog-pagination" aria-label="Paginación del catálogo">
      <span className="catalog-pagination-summary">
        Mostrando <strong>{start}</strong>–<strong>{end}</strong> de <strong>{total}</strong>
      </span>
      <div className="catalog-pagination-controls">
        {showJumps && (
          <button
            type="button"
            className="catalog-pagination-btn"
            onClick={onFirst}
            disabled={page === 0}
            aria-label="Primera página"
          >
            «
          </button>
        )}
        <button
          type="button"
          className="catalog-pagination-btn"
          onClick={onPrev}
          disabled={page === 0}
          aria-label="Página anterior"
        >
          ‹ Anterior
        </button>
        <span className="catalog-pagination-indicator" aria-live="polite">
          Página <strong>{page + 1}</strong> de <strong>{totalPages}</strong>
        </span>
        <button
          type="button"
          className="catalog-pagination-btn"
          onClick={onNext}
          disabled={page >= totalPages - 1}
          aria-label="Página siguiente"
        >
          Siguiente ›
        </button>
        {showJumps && (
          <button
            type="button"
            className="catalog-pagination-btn"
            onClick={onLast}
            disabled={page >= totalPages - 1}
            aria-label="Última página"
          >
            »
          </button>
        )}
      </div>
    </nav>
  );
}
