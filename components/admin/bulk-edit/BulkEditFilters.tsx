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
}: Props) {
  return (
    <div className="bulk-edit-head">
      <div className="bulk-edit-filters" role="search" aria-label="Filtros">
        <select
          className="bulk-edit-filter"
          aria-label="Sección"
          value={filterSection}
          onChange={(e) => setFilterSection(e.target.value as SectionId | "")}
        >
          <option value="">Todas las secciones</option>
          {SECTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="bulk-edit-filter"
          aria-label="Categoría"
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          className="bulk-edit-search"
          placeholder="Buscar por título, descripción o etiqueta…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar en la tabla"
        />
      </div>
      <div className="bulk-edit-meta">
        <select
          className="bulk-edit-filter"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label="Casos por página"
        >
          {pageSizes.map((n) => (
            <option key={n} value={n}>
              {n} / página
            </option>
          ))}
        </select>
        <span className="bulk-edit-count">
          {pageStart + 1}–{Math.min(pageEnd, total)} de {total}
        </span>
      </div>
    </div>
  );
}
