"use client";

import { useState } from "react";
import type { SortOrder } from "@/lib/url";

interface Props {
  /** Number of results currently visible — drives the "N casos" copy. */
  count: number;
  /** Active tag filters; rendered as removable pills. */
  tags: string[];
  /** Active text query, used to enable/disable the clear-filters button. */
  query: string;
  /** Active sort order; the controlled value of the sort select. */
  sort: SortOrder;
  /** Patch the URL with new filter values (replace, not push). */
  onReplace: (patch: Partial<{ tags: string[]; query: string; sort: SortOrder }>) => void;
}

/**
 * Filter chrome below the section hero: live result count, active-tag
 * pills (click to remove), "Limpiar filtros" with a tasteful shake
 * when there's nothing to clear, and the sort selector.
 *
 * Owns one transient piece of UI state — `clearShaking`, the wink
 * animation flag — and otherwise drives everything off props. Each
 * change reaches the URL via `onReplace`, which the parent maps to
 * `replacePatch`.
 */
export default function Toolbar({ count, tags, query, sort, onReplace }: Props) {
  const [clearShaking, setClearShaking] = useState(false);
  const hasFilters = tags.length > 0 || !!query;

  return (
    <div className="toolbar">
      <span className="results">
        {count} {count === 1 ? "caso" : "casos"}
      </span>
      <button
        className={`clear-btn${clearShaking ? " is-shaking" : ""}`}
        disabled={!hasFilters}
        onClick={() => {
          if (!hasFilters) {
            // Wink — nothing to clear, but the user clicked anyway.
            setClearShaking(true);
            setTimeout(() => setClearShaking(false), 400);
            return;
          }
          onReplace({ tags: [], query: "" });
        }}
      >
        Limpiar filtros
      </button>
      {tags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tags.map((t) => (
            <button
              key={t}
              className="tag-chip active"
              onClick={() => onReplace({ tags: tags.filter((x) => x !== t) })}
            >
              {t} ×
            </button>
          ))}
        </div>
      )}
      <div className="toolbar-right">
        <label htmlFor="sort-select" className="toolbar-label">
          Ordenar
        </label>
        <select
          id="sort-select"
          className="sort-select"
          value={sort}
          onChange={(e) => onReplace({ sort: e.target.value as SortOrder })}
        >
          <option value="recent">Más recientes</option>
          <option value="featured">Destacados</option>
          <option value="title">Alfabético</option>
        </select>
      </div>
    </div>
  );
}
