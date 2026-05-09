"use client";

// Pagination footer for `BulkEditTable`. Two simple buttons +
// position indicator. Hidden when totalPages ≤ 1 (the parent
// returns `null` from the JSX site so this component never sees
// the redundant single-page state).

import { useT } from "@/hooks/useLanguage";

interface Props {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

export function BulkEditPagination({ page, totalPages, onPrev, onNext }: Props) {
  const t = useT();
  return (
    <div className="bulk-edit-pagination">
      <button
        type="button"
        className="btn-ghost"
        onClick={onPrev}
        disabled={page === 0}
        aria-label={t("bulk.pagination.prev.aria")}
      >
        {t("bulk.pagination.prev")}
      </button>
      <span className="bulk-edit-page-indicator">
        {t("bulk.pagination.position", { current: page + 1, total: totalPages })}
      </span>
      <button
        type="button"
        className="btn-ghost"
        onClick={onNext}
        disabled={page >= totalPages - 1}
        aria-label={t("bulk.pagination.next.aria")}
      >
        {t("bulk.pagination.next")}
      </button>
    </div>
  );
}
