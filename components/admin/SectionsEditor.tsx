"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { SECTIONS } from "@/lib/data";
import { sectionLabel as defaultSectionLabel } from "@/lib/i18n";
import type { LocalizedString, SectionId } from "@/lib/types";

interface Props {
  /** Predicate — is this section currently hidden from the public nav? */
  isHidden: (id: SectionId) => boolean;
  /** Toggle visibility for a single section. Persisted via the
   *  `useHiddenSections` hook in App.tsx. */
  setHidden: (id: SectionId, hidden: boolean) => void;
  /**
   * Resolve the current label for a section in the active language
   * (ES default), with admin override applied when set.
   */
  getLabel: (id: SectionId, fallback: string) => string;
  /**
   * Apply a label override to a single language slot. Empty string
   * clears that slot (revert to dictionary / default in
   * `lib/data.ts`). Phase-3 i18n: pass `slot: "en"` to update the
   * English rename.
   */
  setLabel: (id: SectionId, label: string, slot?: "es" | "en") => void;
  /** Cases-per-section counter, indexed by section id. Surfaces a
   *  small "N casos" hint per row so the admin sees what they're
   *  hiding before clicking. */
  caseCounts: Record<string, number>;
  /**
   * Raw override map — needed so the editor can render the EN slot
   * value alongside the ES slot. Optional; falls back to "no EN
   * override" when omitted (reasonable for older callers / tests).
   */
  overrides?: Partial<Record<SectionId, LocalizedString>>;
}

/**
 * Admin UI for the four top-level sections. Phase-3 i18n widened the
 * rename to a bilingual pair: each section can have an ES override
 * (mandatory baseline when overriding) and an optional EN
 * translation. Visitors see the slot for their active language with
 * EN→ES fallback.
 *
 * Three controls per row:
 *
 *   1. **Bilingual rename** — click the label or pencil to enter
 *      edit mode, which exposes ES + EN inputs side by side. Enter
 *      / Save commits both slots; Esc / Cancel discards. Clearing
 *      a slot reverts that language to the dictionary default.
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
  overrides,
}: Props) {
  const [editingId, setEditingId] = useState<SectionId | null>(null);
  const [draftEs, setDraftEs] = useState("");
  const [draftEn, setDraftEn] = useState("");

  const startEdit = (id: SectionId, currentEs: string, currentEn: string) => {
    setEditingId(id);
    setDraftEs(currentEs);
    setDraftEn(currentEn);
  };
  const commitEdit = () => {
    if (!editingId) return;
    // Persist both slots independently — `setLabel` deletes the slot
    // when we pass an empty string, which reverts that language to
    // the dictionary default.
    setLabel(editingId, draftEs, "es");
    setLabel(editingId, draftEn, "en");
    setEditingId(null);
    setDraftEs("");
    setDraftEn("");
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraftEs("");
    setDraftEn("");
  };
  const resetToDefault = (id: SectionId) => {
    setLabel(id, "", "es");
    setLabel(id, "", "en");
  };

  return (
    <div className="categories-editor">
      <div className="categories-intro">
        <h2>Secciones</h2>
        <p>
          Renombrá las secciones haciendo click en el lápiz: podés definir un nombre en español
          (mandatorio cuando lo personalizas) y otro en inglés (opcional). Los visitantes verán el
          slot que coincida con el idioma activo, con fallback al español. La URL y los enlaces
          compartidos no cambian. Las secciones ocultas tampoco aparecen en el menú aunque la URL
          siga funcionando.
        </p>
      </div>

      <ul className="categories-list">
        {SECTIONS.map((s) => {
          const hidden = isHidden(s.id);
          const count = caseCounts[s.id] ?? 0;
          const currentLabelEs = getLabel(s.id, s.label);
          const overrideEn = overrides?.[s.id]?.en ?? "";
          // The "default" comparison is anchored to the dictionary
          // baseline (built-in section labels live there) — anything
          // different from the dict ES means the admin renamed.
          const dictDefault = defaultSectionLabel(s.id, "es");
          const isCustomized = currentLabelEs !== dictDefault || overrideEn !== "";
          const isEditing = editingId === s.id;
          return (
            <li key={s.id} className={`categories-row${hidden ? " is-hidden" : ""}`}>
              {isEditing ? (
                <span className="categories-row-bilingual-edit">
                  <input
                    type="text"
                    autoFocus
                    className="admin-input categories-row-input"
                    value={draftEs}
                    onChange={(e) => setDraftEs(e.target.value)}
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
                    aria-label={`Renombrar ${s.label} en español`}
                    placeholder={dictDefault}
                  />
                  <input
                    type="text"
                    className="admin-input categories-row-input"
                    value={draftEn}
                    onChange={(e) => setDraftEn(e.target.value)}
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
                    aria-label={`Renombrar ${s.label} en inglés`}
                    placeholder="English (opcional)"
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={commitEdit}
                    title="Guardar (Enter)"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={cancelEdit}
                    title="Cancelar (Esc)"
                  >
                    Cancelar
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="categories-row-label categories-row-label--editable"
                  onClick={() => startEdit(s.id, currentLabelEs, overrideEn)}
                  title="Click para renombrar"
                >
                  {currentLabelEs}
                  {overrideEn && (
                    <span className="categories-row-translation" title="Traducción al inglés">
                      · {overrideEn}
                    </span>
                  )}
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
                    title={`Restaurar nombres por defecto (${dictDefault})`}
                  >
                    Restaurar
                  </button>
                )}
                {!isEditing && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => startEdit(s.id, currentLabelEs, overrideEn)}
                    aria-label={`Renombrar ${currentLabelEs}`}
                    title="Renombrar (ES + EN)"
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
                      ? `Mostrar ${currentLabelEs} en el menú`
                      : `Ocultar ${currentLabelEs} del menú`
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
