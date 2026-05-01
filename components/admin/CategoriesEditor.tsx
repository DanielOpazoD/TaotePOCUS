"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import type { Category } from "@/lib/types";

interface Props {
  /** Built-in + custom categories, in display order. */
  categories: Category[];
  /** Add a custom category. Returns the created entry or null on
   *  empty / duplicate label / DB rejection. Async (DB-first per
   *  ADR-0011 follow-up). */
  onAdd: (label: string) => Promise<Category | null>;
  /** Rename a custom category (built-ins are read-only). Returns
   *  true on success; false on validation failure or DB rejection. */
  onRename: (id: string, label: string) => Promise<boolean>;
  /** Remove a custom category. Returns true on success; false on
   *  validation failure or DB rejection. */
  onRemove: (id: string) => Promise<boolean>;
  /** Predicate — is this id a runtime-defined custom category? */
  isCustom: (id: string) => boolean;
  /** Predicate — is this category hidden from the public Atlas view? */
  isHidden: (id: string) => boolean;
  /** Toggle visibility for any category (built-in or custom). */
  setHidden: (id: string, hidden: boolean) => void;
  /** Count of cases per category id, for the "in use" hint shown
   *  next to each row and as a guard against blind deletion. */
  caseCounts: Record<string, number>;
}

/**
 * Admin UI for managing categories. Built-ins are listed read-only at
 * the top; custom ones are listed below with inline rename + delete.
 *
 * Visual rhythm matches the existing admin tables (admin-section-head
 * + admin-stat-label) so the editor feels native to the panel.
 */
export default function CategoriesEditor({
  categories,
  onAdd,
  onRename,
  onRemove,
  isCustom,
  isHidden,
  setHidden,
  caseCounts,
}: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const created = await onAdd(draft);
    if (!created) {
      // Either validation rejected (duplicate / empty) or the DB
      // wrote back not-ok. The toast layer surfaces the DB reason
      // separately; the inline error covers the validation case.
      setError("No se pudo crear la categoría (¿ya existe?)");
      return;
    }
    setDraft("");
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setEditingLabel(c.label);
  };

  const commitEdit = async () => {
    if (editingId == null) return;
    if (editingLabel.trim()) await onRename(editingId, editingLabel);
    setEditingId(null);
    setEditingLabel("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingLabel("");
  };

  const builtIns = categories.filter((c) => !isCustom(c.id));
  const customs = categories.filter((c) => isCustom(c.id));

  return (
    <div className="categories-editor">
      <div className="categories-intro">
        <h2>Categorías</h2>
        <p>
          Las categorías integradas no se pueden modificar. Las personalizadas que crees acá
          aparecerán en el clasificador y en el formulario de edición.
        </p>
      </div>

      <form className="categories-add" onSubmit={handleAdd}>
        <input
          type="text"
          className="admin-input"
          placeholder="Nueva categoría (ej. Pediatría)"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          maxLength={48}
          aria-label="Nombre de la nueva categoría"
        />
        <button type="submit" className="btn-primary" disabled={!draft.trim()}>
          <Icon.plus /> Agregar
        </button>
      </form>
      {error && (
        <p className="categories-error" role="alert">
          {error}
        </p>
      )}

      <div className="admin-section-head">
        <h3>Integradas</h3>
        <span className="admin-trash-count">{builtIns.length} categorías</span>
      </div>
      <ul className="categories-list">
        {builtIns.map((c) => {
          const hidden = isHidden(c.id);
          return (
            <li key={c.id} className={`categories-row${hidden ? " is-hidden" : ""}`}>
              <span className="categories-row-label">{c.label}</span>
              <span className="categories-row-id">{c.id}</span>
              <span className="categories-row-count">
                {caseCounts[c.id] ?? 0} caso{caseCounts[c.id] === 1 ? "" : "s"}
              </span>
              <span className="categories-row-actions">
                <button
                  type="button"
                  className={`categories-visibility-toggle${hidden ? " is-hidden" : ""}`}
                  onClick={() => setHidden(c.id, !hidden)}
                  aria-label={
                    hidden ? `Mostrar ${c.label} en el atlas` : `Ocultar ${c.label} del atlas`
                  }
                  aria-pressed={!hidden}
                  title={
                    hidden
                      ? "Oculta en el sidebar público — click para mostrar"
                      : "Visible en el sidebar público — click para ocultar"
                  }
                >
                  {hidden ? "🚫" : "👁"}
                </button>
                <span className="categories-row-locked-label">Integrada</span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="admin-section-head">
        <h3>Personalizadas</h3>
        <span className="admin-trash-count">{customs.length} categorías</span>
      </div>
      {customs.length === 0 ? (
        <p className="categories-empty">
          Aún no has creado categorías personalizadas. Usa el campo de arriba para empezar.
        </p>
      ) : (
        <ul className="categories-list">
          {customs.map((c) => {
            const isEditing = editingId === c.id;
            const inUse = caseCounts[c.id] ?? 0;
            const hidden = isHidden(c.id);
            return (
              <li key={c.id} className={`categories-row${hidden ? " is-hidden" : ""}`}>
                {isEditing ? (
                  <input
                    type="text"
                    autoFocus
                    className="admin-input categories-row-input"
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    onBlur={commitEdit}
                    maxLength={48}
                    aria-label={`Renombrar ${c.label}`}
                  />
                ) : (
                  <span className="categories-row-label">{c.label}</span>
                )}
                <span className="categories-row-id">{c.id}</span>
                <span className="categories-row-count">
                  {inUse} caso{inUse === 1 ? "" : "s"}
                </span>
                <span className="categories-row-actions">
                  {!isEditing && (
                    <>
                      <button
                        type="button"
                        className={`categories-visibility-toggle${hidden ? " is-hidden" : ""}`}
                        onClick={() => setHidden(c.id, !hidden)}
                        aria-label={hidden ? `Mostrar ${c.label}` : `Ocultar ${c.label}`}
                        aria-pressed={!hidden}
                        title={
                          hidden
                            ? "Oculta en el sidebar público — click para mostrar"
                            : "Visible en el sidebar público — click para ocultar"
                        }
                      >
                        {hidden ? "🚫" : "👁"}
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => startEdit(c)}
                        aria-label={`Renombrar ${c.label}`}
                        title="Renombrar"
                      >
                        {Icon.edit()}
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        onClick={() => {
                          // Soft confirm via window.confirm — simple
                          // and fits the "danger only when in use"
                          // gating below.
                          if (
                            inUse > 0 &&
                            !window.confirm(
                              `${c.label} está asignada a ${inUse} caso${
                                inUse === 1 ? "" : "s"
                              }. Si la eliminas, esos casos quedarán con la categoría "${c.id}" como referencia rota. ¿Continuar?`,
                            )
                          )
                            return;
                          // Fire the async remove. The undo toast
                          // (set up in App.tsx wrapper) lets the admin
                          // walk back if the click was a slip.
                          void onRemove(c.id);
                        }}
                        aria-label={`Eliminar ${c.label}`}
                        title="Eliminar categoría"
                      >
                        {Icon.trash()}
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
