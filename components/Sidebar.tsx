"use client";

import { CategoryGlyph } from "@/lib/icons";
import type { CategoryId, CategoryWithCount } from "@/lib/types";
import type { Difficulty } from "@/lib/url";

interface Props {
  activeCat: CategoryId | null;
  setActiveCat: (c: CategoryId | null) => void;
  activeTags: string[];
  toggleTag: (t: string) => void;
  totalCount: number;
  categories: CategoryWithCount[];
  tags: string[];
  /** Editorial filters wired through useViewState. */
  level: Difficulty | null;
  setLevel: (l: Difficulty | null) => void;
  spec: string | null;
  setSpec: (s: string | null) => void;
  specialties: string[];
}

const LEVELS: { id: Difficulty; label: string }[] = [
  { id: "basic", label: "Básico" },
  { id: "intermediate", label: "Intermedio" },
  { id: "advanced", label: "Avanzado" },
];

export default function Sidebar({
  activeCat,
  setActiveCat,
  activeTags,
  toggleTag,
  totalCount,
  categories,
  tags,
  level,
  setLevel,
  spec,
  setSpec,
  specialties,
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
        <h4>Nivel</h4>
        <div className="level-toggle" role="radiogroup" aria-label="Nivel de dificultad">
          <button
            type="button"
            role="radio"
            aria-checked={level === null}
            className={level === null ? "active" : ""}
            onClick={() => setLevel(null)}
          >
            Todos
          </button>
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={level === l.id}
              className={level === l.id ? "active" : ""}
              onClick={() => setLevel(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {specialties.length > 1 && (
        <div className="side-section">
          <h4>
            <label htmlFor="specialty-select">Especialidad</label>
          </h4>
          <select
            id="specialty-select"
            className="specialty-select"
            value={spec ?? ""}
            onChange={(e) => setSpec(e.target.value || null)}
          >
            <option value="">Todas</option>
            {specialties.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

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
