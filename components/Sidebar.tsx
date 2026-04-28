"use client";

import { CategoryGlyph, Icon } from "@/lib/icons";
import type { CategoryId, CategoryWithCount } from "@/lib/types";

interface Props {
  activeCat: CategoryId | null;
  setActiveCat: (c: CategoryId | null) => void;
  activeTags: string[];
  toggleTag: (t: string) => void;
  totalCount: number;
  categories: CategoryWithCount[];
  tags: string[];
  /** Collapse the sidebar to a thin rail. Persisted by the parent. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export default function Sidebar({
  activeCat,
  setActiveCat,
  activeTags,
  toggleTag,
  totalCount,
  categories,
  tags,
  collapsed,
  onToggleCollapsed,
}: Props) {
  return (
    <aside
      className={`sidebar${collapsed ? " is-collapsed" : ""}`}
      aria-label="Filtros y categorías"
    >
      <button
        type="button"
        className="sidebar-toggle"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? "Expandir panel lateral" : "Colapsar panel lateral"}
        aria-expanded={!collapsed}
        title={collapsed ? "Expandir" : "Colapsar"}
      >
        {collapsed ? Icon.arrowRight() : Icon.arrowLeft()}
      </button>
      <div className="side-section sidebar-categories">
        <h4>Categorías</h4>
        <ul className="cat-list">
          <li>
            <button
              className={!activeCat ? "active" : ""}
              onClick={() => setActiveCat(null)}
              title="Todos"
            >
              <span className="cat-label">
                <span className="cat-glyph" aria-hidden="true">
                  {Icon.search()}
                </span>
                <span className="cat-text">Todos</span>
              </span>
              <span className="cat-count">{totalCount}</span>
            </button>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <button
                className={activeCat === c.id ? "active" : ""}
                onClick={() => setActiveCat(c.id)}
                title={c.label}
              >
                <span className="cat-label">
                  <span className="cat-glyph" aria-hidden="true">
                    {CategoryGlyph[c.id] ?? null}
                  </span>
                  <span className="cat-text">{c.label}</span>
                </span>
                <span className="cat-count">{c.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="side-section sidebar-tags">
        <h4>Etiquetas frecuentes</h4>
        <div className="tags-cloud">
          {tags.slice(0, 14).map((t) => (
            <button
              key={t}
              className={`tag-chip ${activeTags.includes(t) ? "active" : ""}`}
              onClick={() => toggleTag(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
