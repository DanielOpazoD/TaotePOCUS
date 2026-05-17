"use client";

// Top filter bar for `BulkEditTable`. Three controls:
//
//   - Section dropdown — narrows to one of the catalog sections.
//   - Category dropdown — narrows further within the section.
//   - Free-text search — matches title, description, or any tag.
//
// Page size + result counter sit on the right so the operator can
// see "1-50 de 199" and "50 / page" without scanning across the
// whole table footer.
//
// Pure render component: every piece of state lives in the
// orchestrator above; this file just provides the controls.

import { SECTIONS } from "@/lib/data";
import { categoryLabelEs, sectionLabel } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import type { Category, SectionId } from "@/lib/types";

interface Props {
  filterSection: SectionId | "";
  setFilterSection: (s: SectionId | "") => void;
  filterCat: string;
  setFilterCat: (c: string) => void;
  query: string;
  setQuery: (q: string) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  pageStart: number;
  pageEnd: number;
  total: number;
  categories: Category[];
  pageSizes: readonly number[];
  /** Counts per section across the FULL catalog (independent of any
   *  active filter). Drives the "(N)" suffix on each option label so
   *  the admin sees the bucket size before narrowing. */
  casesPerSection: Map<string, number>;
  /** Counts per category across the FULL catalog. Same role as
   *  `casesPerSection` for the category dropdown. */
  casesPerCategory: Map<string, number>;
  /** Number of cases currently matching the active filter (across
   *  all pages). Drives the "✨ IA reescribir todos los filtrados"
   *  button label. */
  filteredCount: number;
  /** When provided, the AI-rewrite-all button renders to the right
   *  of the result counter. Click → orchestrator selects every
   *  filtered case and opens the bulk-rewrite modal. */
  onAIRewriteFiltered?: () => void;
}

export function BulkEditFilters({
  filterSection,
  setFilterSection,
  filterCat,
  setFilterCat,
  query,
  setQuery,
  pageSize,
  setPageSize,
  pageStart,
  pageEnd,
  total,
  categories,
  pageSizes,
  casesPerSection,
  casesPerCategory,
  filteredCount,
  onAIRewriteFiltered,
}: Props) {
  const { lang, t } = useLanguage();
  const hasActiveFilters = filterSection !== "" || filterCat !== "" || query.trim() !== "";
  return (
    <div className="bulk-edit-head">
      <div className="bulk-edit-filters" role="search" aria-label={t("bulk.filters.aria")}>
        <select
          className="bulk-edit-filter"
          aria-label={t("bulk.filter.section.aria")}
          value={filterSection}
          onChange={(e) => setFilterSection(e.target.value as SectionId | "")}
        >
          <option value="">{t("bulk.filter.section.all")}</option>
          {SECTIONS.map((s) => {
            // Append the bucket count so the admin sees the size of
            // each section before narrowing. The count comes from the
            // FULL catalog (not the current filter), so "Pulmonar (47)"
            // is stable as the user types into the search field.
            const n = casesPerSection.get(s.id) ?? 0;
            return (
              <option key={s.id} value={s.id}>
                {sectionLabel(s.id, lang)} ({n})
              </option>
            );
          })}
        </select>
        <select
          className="bulk-edit-filter"
          aria-label={t("bulk.filter.category.aria")}
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
        >
          <option value="">{t("bulk.filter.category.all")}</option>
          {categories.map((c) => {
            const n = casesPerCategory.get(c.id) ?? 0;
            return (
              <option key={c.id} value={c.id}>
                {categoryLabelEs(c)} ({n})
              </option>
            );
          })}
        </select>
        <input
          type="search"
          className="bulk-edit-search"
          placeholder={t("bulk.filter.search.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("bulk.filter.search.aria")}
        />
      </div>
      <div className="bulk-edit-meta">
        <select
          className="bulk-edit-filter"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label={t("bulk.pagesize.aria")}
        >
          {pageSizes.map((n) => (
            <option key={n} value={n}>
              {t("bulk.pagesize.option", { n })}
            </option>
          ))}
        </select>
        <span className="bulk-edit-count">
          {t("bulk.count.range", {
            start: pageStart + 1,
            end: Math.min(pageEnd, total),
            total,
          })}
        </span>
        {/* AI rewrite-all-filtered button. Visible only when a filter
            actually narrows the catalog — without a filter active,
            "rewrite all 326 cases" is too easy to click by accident
            (~$0.50 USD + ~30 min). Forcing the admin to FILTER first
            (by section, category, or query) keeps the operation
            intentional. The bulk modal that opens still requires an
            explicit confirm with the per-case cost estimate. */}
        {onAIRewriteFiltered && hasActiveFilters && filteredCount > 0 && (
          <button
            type="button"
            className="bulk-edit-filter-ai-rewrite"
            onClick={onAIRewriteFiltered}
            title={`Reescribir con IA los ${filteredCount} casos que coinciden con los filtros actuales`}
          >
            ✨ IA reescribir todos ({filteredCount})
          </button>
        )}
      </div>
    </div>
  );
}
