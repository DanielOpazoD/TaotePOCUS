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
import { categoryLabelEs, sectionLabel } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
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
  const { lang, t } = useLanguage();
  const countLabel = t(
    selectedCount === 1 ? "bulk.selection.count.one" : "bulk.selection.count.many",
    { count: selectedCount },
  );
  return (
    <div className="bulk-edit-actionbar" role="toolbar" aria-label={t("bulk.selection.aria")}>
      <span className="bulk-edit-actionbar-count">{countLabel}</span>
      <select
        className="bulk-edit-filter"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            onApplySection(e.target.value as SectionId);
            e.target.value = "";
          }
        }}
        aria-label={t("bulk.action.changeSection.aria")}
      >
        <option value="">{t("bulk.action.changeSection")}</option>
        {SECTIONS.map((s) => (
          <option key={s.id} value={s.id}>
            → {sectionLabel(s.id, lang)}
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
        aria-label={t("bulk.action.changeCategory.aria")}
      >
        <option value="">{t("bulk.action.changeCategory")}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            → {categoryLabelEs(c)}
          </option>
        ))}
      </select>
      <button type="button" className="btn-ghost" onClick={() => onApplyReviewed(true)}>
        {t("bulk.action.markReviewed")}
      </button>
      <button type="button" className="btn-ghost" onClick={() => onApplyReviewed(false)}>
        {t("bulk.action.unmarkReviewed")}
      </button>
      <button type="button" className="btn-danger bulk-edit-actionbar-delete" onClick={onDelete}>
        {Icon.trash()} {t("bulk.action.delete")}
      </button>
      <button type="button" className="btn-ghost" onClick={onClear}>
        {t("bulk.action.clear")}
      </button>
    </div>
  );
}
