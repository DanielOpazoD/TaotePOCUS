"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { SECTIONS } from "@/lib/data";
import type { SectionId } from "@/lib/types";

interface Props {
  /** Predicate — is this section currently hidden from the public nav? */
  isHidden: (id: SectionId) => boolean;
  /** Toggle visibility for a single section. Persisted via the
   *  `useHiddenSections` hook in App.tsx. */
  setHidden: (id: SectionId, hidden: boolean) => void;
  /** Resolve the current label for a section (override or default). */
  getLabel: (id: SectionId, fallback: string) => string;
  /** Apply a label override. Empty string clears it (revert to
   *  default in `lib/data.ts`). */
  setLabel: (id: SectionId, label: string) => void;
  /** Cases-per-section counter, indexed by section id. Surfaces a
   *  small "N casos" hint per row so the admin sees what they're
   *  hiding before clicking. */
  caseCounts: Record<string, number>;
}

/**
 * Admin UI for the four top-level sections. Three controls per row:
 *
 *   1. **Inline rename** — click the label to edit; Enter / blur
 *      saves; Esc cancels; clearing the field reverts to the
 *      default. Affects what visitors see in the nav and on the
 *      section hero. SEO surfaces (sitemap, OG) keep the static
 *      defaults — pure cosmetic personalization.
 *   2. **Visibility toggle** (eye / 🚫). Hides the section from the
 *      top nav and mobile drawer. Direct URLs still resolve.
 *   3. Cases counter (`N casos`) for context.
 *
 * Section ids and URL paths can't be changed at runtime — they're
 * the literal `SectionId` union and they anchor every internal
 * link. If you need a brand-new section, that's a code change
 * (extend `SectionId` + add a row to `SECTIONS`).
 */
export default function SectionsEditor({
  isHidden,
  setHidden,
  getLabel,
  setLabel,
  caseCounts,
}: Props) {
  const [editingId, setEditingId] = useState<SectionId | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (id: SectionId, current: string) => {
    setEditingId(id);
    setDraft(current);
  };
  const commitEdit = () => {
    if (editingId) setLabel(editingId, draft);
    setEditingId(null);
    setDraft("");
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };
  const resetToDefault = (id: SectionId) => {
    setLabel(id, "");
  };

  return (
    <div className="categories-editor">
      <div className="categories-intro">
        <h2>Secciones</h2>
        <p>
          Renombrá las secciones haciendo click en el nombre — los visitantes verán el nombre nuevo
          en el menú y en el encabezado. La URL y los enlaces compartidos no cambian. Las secciones
          ocultas tampoco aparecen en el menú aunque la URL siga funcionando.
        </p>
      </div>

      <ul className="categories-list">
        {SECTIONS.map((s) => {
          const hidden = isHidden(s.id);
          const count = caseCounts[s.id] ?? 0;
          const currentLabel = getLabel(s.id, s.label);
          const isCustomized = currentLabel !== s.label;
          const isEditing = editingId === s.id;
          return (
            <li key={s.id} className={`categories-row${hidden ? " is-hidden" : ""}`}>
              {isEditing ? (
                <input
                  type="text"
                  autoFocus
                  className="admin-input categories-row-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitEdit();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEdit();
                    }
                  }}
                  maxLength={48}
                  aria-label={`Renombrar ${s.label}`}
                  placeholder={s.label}
                />
              ) : (
                <button
                  type="button"
                  className="categories-row-label categories-row-label--editable"
                  onClick={() => startEdit(s.id, currentLabel)}
                  title="Click para renombrar"
                >
                  {currentLabel}
                  {isCustomized && (
                    <span className="categories-row-rename-mark" title="Renombrada del default">
                      ✎
                    </span>
                  )}
                </button>
              )}
              <span className="categories-row-id">{s.id}</span>
              <span className="categories-row-count">
                {count} caso{count === 1 ? "" : "s"}
              </span>
              <span className="categories-row-actions">
                {!isEditing && isCustomized && (
                  <button
                    type="button"
                    className="link-btn categories-row-reset"
                    onClick={() => resetToDefault(s.id)}
                    title={`Restaurar nombre por defecto: ${s.label}`}
                  >
                    Restaurar
                  </button>
                )}
                {!isEditing && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => startEdit(s.id, currentLabel)}
                    aria-label={`Renombrar ${currentLabel}`}
                    title="Renombrar"
                  >
                    {Icon.edit()}
                  </button>
                )}
                <button
                  type="button"
                  className={`categories-visibility-toggle${hidden ? " is-hidden" : ""}`}
                  onClick={() => setHidden(s.id, !hidden)}
                  aria-label={
                    hidden
                      ? `Mostrar ${currentLabel} en el menú`
                      : `Ocultar ${currentLabel} del menú`
                  }
                  aria-pressed={!hidden}
                  title={
                    hidden
                      ? "Oculta en el menú público — click para mostrar"
                      : "Visible en el menú público — click para ocultar"
                  }
                >
                  {hidden ? "🚫" : "👁"}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
