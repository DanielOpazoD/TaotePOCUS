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
import { categoryLabelEs } from "@/lib/i18n";
import { useT } from "@/hooks/useLanguage";
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
  const t = useT();
  const ANY_TARGET = "__pick__";
  const [sectionTarget, setSectionTarget] = useState<string>(ANY_TARGET);
  const [categoryTarget, setCategoryTarget] = useState<string>(ANY_TARGET);

  const apply = (patch: Partial<CaseRecord>) => {
    if (!onBulkPatch) return;
    onBulkPatch(ids, patch);
    afterAction();
  };

  return (
    <div className="classifier-bulk" role="region" aria-label={t("classifier.bulk.aria")}>
      <div className="classifier-bulk-count">
        <strong>{count}</strong>{" "}
        {t(count === 1 ? "classifier.bulk.count.suffix.one" : "classifier.bulk.count.suffix.many")}
      </div>
      <div className="classifier-bulk-actions">
        {onBulkPatch && (
          <>
            <button
              type="button"
              className="classifier-bulk-btn"
              onClick={() => apply({ reviewed: true })}
              title={t("classifier.bulk.markReviewed.title")}
            >
              {t("classifier.bulk.markReviewed")}
            </button>
            <button
              type="button"
              className="classifier-bulk-btn"
              onClick={() => apply({ reviewed: false })}
              title={t("classifier.bulk.unmarkReviewed.title")}
            >
              {t("classifier.bulk.unmarkReviewed")}
            </button>
            <label className="classifier-bulk-select">
              <span className="sr-only">{t("classifier.bulk.section.label")}</span>
              <select
                value={sectionTarget}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === ANY_TARGET) return;
                  apply({ section: v as SectionId });
                  setSectionTarget(ANY_TARGET);
                }}
              >
                <option value={ANY_TARGET}>{t("classifier.bulk.section.placeholder")}</option>
                {SECTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="classifier-bulk-select">
              <span className="sr-only">{t("classifier.bulk.category.label")}</span>
              <select
                value={categoryTarget}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === ANY_TARGET) return;
                  apply({ category: v });
                  setCategoryTarget(ANY_TARGET);
                }}
              >
                <option value={ANY_TARGET}>{t("classifier.bulk.category.placeholder")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryLabelEs(c)}
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
            title={t("classifier.bulk.trash.title")}
          >
            {t("classifier.bulk.trash")}
          </button>
        )}
      </div>
      <button
        type="button"
        className="classifier-bulk-clear"
        onClick={onClear}
        title={t("classifier.bulk.clear.title")}
      >
        {t("classifier.bulk.clear")}
      </button>
    </div>
  );
}
