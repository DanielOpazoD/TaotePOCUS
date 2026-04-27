"use client";

import { CategoryGlyph } from "@/lib/icons";
import type { Category, CategoryId } from "@/lib/types";

interface Props {
  activeCat: CategoryId | null;
  setActiveCat: (c: CategoryId | null) => void;
  activeTags: string[];
  toggleTag: (t: string) => void;
  totalCount: number;
  categories: Category[];
  tags: string[];
}

export default function Sidebar({
  activeCat,
  setActiveCat,
  activeTags,
  toggleTag,
  totalCount,
  categories,
  tags,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="side-section" style={{ width: "240px" }}>
        <h4>Categorías</h4>
        <ul className="cat-list">
          <li>
            <button className={!activeCat ? "active" : ""} onClick={() => setActiveCat(null)}>
              <span>Todos</span>
              <span className="cat-count">{totalCount}</span>
            </button>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <button
                className={activeCat === c.id ? "active" : ""}
                onClick={() => setActiveCat(c.id)}
              >
                <span className="cat-label">
                  <span className="cat-glyph" aria-hidden="true">
                    {CategoryGlyph[c.id] ?? null}
                  </span>
                  {c.label}
                </span>
                <span className="cat-count">{c.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="side-section">
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
