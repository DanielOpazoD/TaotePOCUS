"use client";

// Sortable column header for `BulkEditTable`. Clicking cycles
// through three states:
//
//   none → asc → desc → none
//
// The arrow indicator lives on the right of the label; the th
// itself absorbs the click via the inner button so the entire
// column header is the target. The asc / desc / none state is
// owned by the parent — this component is a pure render +
// callback.

import type { SortDir, SortField } from "../types";

interface Props {
  field: NonNullable<SortField>;
  active: boolean;
  dir: SortDir;
  onClick: (field: NonNullable<SortField>) => void;
  className?: string;
  title?: string;
  children: React.ReactNode;
}

export function BulkEditSortHeader({
  field,
  active,
  dir,
  onClick,
  className,
  title,
  children,
}: Props) {
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "";
  return (
    <th className={className} title={title}>
      <button
        type="button"
        className={"bulk-edit-sort-btn" + (active ? " is-active" : "")}
        onClick={() => onClick(field)}
        aria-label={`Ordenar por ${field}`}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <span>{children}</span>
        <span className="bulk-edit-sort-arrow" aria-hidden="true">
          {arrow}
        </span>
      </button>
    </th>
  );
}
