"use client";

// Pagination control for the public catalog grid. Sits below the
// `case-grid` and surfaces:
//   - "Showing X–Y of Z" copy.
//   - Page indicator ("Page 3 of 11").
//   - Prev / Next buttons.
//   - First / Last shortcuts when total pages > 5.
//
// Renders nothing when there's only a single page — pagination
// chrome at that scale reads as clutter.
//
// State lives in the parent (URL via useViewState). This component
// is purely presentational + wires button clicks to the
// `onPageChange` callback.
//
// i18n: the copy is dictionary-driven (`pagination.*`). The summary
// + indicator strings are stitched from connector words so the bold
// numeric values can sit between them in either language order
// ("Mostrando 1–30 de 64" / "Showing 1–30 of 64").

import { useT } from "@/hooks/useLanguage";

interface Props {
  /** 0-indexed current page. */
  page: number;
  /** Total number of pages (>= 1). */
  totalPages: number;
  /** Total number of items across all pages — drives the
   *  "Showing X–Y of Z" copy. */
  total: number;
  /** Items per page — used by the same copy. */
  pageSize: number;
  /** Page-change callback. Receives a 0-indexed page; the parent
   *  is responsible for clamping if it ever passes invalid values
   *  (this component already clamps internally). */
  onPageChange: (page: number) => void;
}

export function CatalogPagination({ page, totalPages, total, pageSize, onPageChange }: Props) {
  const t = useT();
  if (totalPages <= 1) return null;

  // Clamp the displayed range to the actual count so the last
  // page reads "Showing 301–326 of 326" instead of overshooting.
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
    <nav className="catalog-pagination" aria-label={t("pagination.aria.label")}>
      <span className="catalog-pagination-summary">
        {t("pagination.summary.showing")} <strong>{start}</strong>
        {t("pagination.summary.range")}
        <strong>{end}</strong> {t("pagination.summary.of")} <strong>{total}</strong>
      </span>
      <div className="catalog-pagination-controls">
        {showJumps && (
          <button
            type="button"
            className="catalog-pagination-btn"
            onClick={onFirst}
            disabled={page === 0}
            aria-label={t("pagination.aria.first")}
          >
            «
          </button>
        )}
        <button
          type="button"
          className="catalog-pagination-btn"
          onClick={onPrev}
          disabled={page === 0}
          aria-label={t("pagination.aria.prev")}
        >
          {t("pagination.prev")}
        </button>
        <span className="catalog-pagination-indicator" aria-live="polite">
          {t("pagination.indicator.page")} <strong>{page + 1}</strong>{" "}
          {t("pagination.indicator.of")} <strong>{totalPages}</strong>
        </span>
        <button
          type="button"
          className="catalog-pagination-btn"
          onClick={onNext}
          disabled={page >= totalPages - 1}
          aria-label={t("pagination.aria.next")}
        >
          {t("pagination.next")}
        </button>
        {showJumps && (
          <button
            type="button"
            className="catalog-pagination-btn"
            onClick={onLast}
            disabled={page >= totalPages - 1}
            aria-label={t("pagination.aria.last")}
          >
            »
          </button>
        )}
      </div>
    </nav>
  );
}
