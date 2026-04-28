"use client";

import { useEffect, useState } from "react";
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

const TAGS_OPEN_KEY = "sidebarTagsOpen";

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
  // Tags section collapse state, persisted in localStorage so the
  // user's preference survives reloads. Default open on first visit
  // so newcomers see the vocabulary; once they collapse it, it stays.
  // Active tags force-open so the user can see what they've applied.
  const [tagsOpen, setTagsOpen] = useState(true);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAGS_OPEN_KEY);
      if (saved === "0") setTagsOpen(false);
    } catch {
      /* SSR / privacy mode */
    }
  }, []);
  const toggleTagsOpen = () => {
    setTagsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(TAGS_OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  // If the user has tags applied but collapsed the section, expand it
  // automatically — otherwise the active filter is invisible.
  const effectivelyOpen = tagsOpen || activeTags.length > 0;

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
      <div className={`side-section sidebar-tags${effectivelyOpen ? " is-open" : " is-closed"}`}>
        {/* Section header doubles as the collapse toggle. The chevron
            sits on the right of the label and rotates 90° when open.
            Clicking anywhere on the row toggles. */}
        <button
          type="button"
          className="side-section-toggle"
          onClick={toggleTagsOpen}
          aria-expanded={effectivelyOpen}
          aria-controls="sidebar-tags-cloud"
        >
          <span>Etiquetas</span>
          <span className="side-section-meta tnum">{tags.length}</span>
          <span className="side-section-chevron" aria-hidden="true">
            {Icon.arrowRight()}
          </span>
        </button>
        {effectivelyOpen && (
          <div className="tags-cloud" id="sidebar-tags-cloud">
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
        )}
      </div>
    </aside>
  );
}
