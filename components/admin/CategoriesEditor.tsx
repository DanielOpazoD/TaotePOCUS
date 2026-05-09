"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { categoryLabelEs } from "@/lib/i18n";
import { useT } from "@/hooks/useLanguage";
import type { Category, LocalizedString } from "@/lib/types";

interface Props {
  /** Built-in + custom categories, in display order. */
  categories: Category[];
  /** Add a custom category. Returns the created entry or null on
   *  empty / duplicate label / DB rejection. Async (DB-first per
   *  ADR-0011 follow-up). Phase-3 i18n widened the input to accept
   *  a `LocalizedString` (with optional EN slot). */
  onAdd: (label: string | LocalizedString) => Promise<Category | null>;
  /** Rename a custom category (built-ins are read-only). Returns
   *  true on success; false on validation failure or DB rejection. */
  onRename: (id: string, label: string | LocalizedString) => Promise<boolean>;
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

/** Read the EN slot of a category label (or empty string for legacy
 *  plain-string entries / built-ins). */
function categoryLabelEn(label: Category["label"]): string {
  if (typeof label === "string") return "";
  return label.en ?? "";
}

/**
 * Admin UI for managing categories. Built-ins are listed read-only at
 * the top; custom ones are listed below with inline rename + delete.
 *
 * Phase-3 i18n: the add form and inline rename both accept a Spanish
 * baseline (required) plus an optional English translation. Built-in
 * categories aren't editable here — their bilingual labels come from
 * the i18n dictionary (`category.cardiac` etc.).
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
  const t = useT();
  const [draftEs, setDraftEs] = useState("");
  const [draftEn, setDraftEn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEs, setEditingEs] = useState("");
  const [editingEn, setEditingEn] = useState("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedEs = draftEs.trim();
    if (!trimmedEs) return;
    const next: LocalizedString = { es: trimmedEs };
    const trimmedEn = draftEn.trim();
    if (trimmedEn) next.en = trimmedEn;
    const created = await onAdd(next);
    if (!created) {
      // Either validation rejected (duplicate / empty) or the DB
      // wrote back not-ok. The toast layer surfaces the DB reason
      // separately; the inline error covers the validation case.
      setError(t("categories.error.create"));
      return;
    }
    setDraftEs("");
    setDraftEn("");
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setEditingEs(categoryLabelEs(c));
    setEditingEn(categoryLabelEn(c.label));
  };

  const commitEdit = async () => {
    if (editingId == null) return;
    const trimmedEs = editingEs.trim();
    if (!trimmedEs) {
      // Empty ES is rejected — the baseline is mandatory. Fall
      // through without saving so the admin can correct or cancel.
      cancelEdit();
      return;
    }
    const next: LocalizedString = { es: trimmedEs };
    const trimmedEn = editingEn.trim();
    if (trimmedEn) next.en = trimmedEn;
    await onRename(editingId, next);
    setEditingId(null);
    setEditingEs("");
    setEditingEn("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingEs("");
    setEditingEn("");
  };

  const builtIns = categories.filter((c) => !isCustom(c.id));
  const customs = categories.filter((c) => isCustom(c.id));

  return (
    <div className="categories-editor">
      <div className="categories-intro">
        <h2>{t("categories.intro.title")}</h2>
        <p>{t("categories.intro.body")}</p>
      </div>

      <form className="categories-add categories-add--bilingual" onSubmit={handleAdd}>
        <input
          type="text"
          className="admin-input"
          placeholder={t("categories.add.placeholder.es")}
          value={draftEs}
          onChange={(e) => {
            setDraftEs(e.target.value);
            if (error) setError(null);
          }}
          maxLength={48}
          aria-label={t("categories.add.aria.es")}
          required
        />
        <input
          type="text"
          className="admin-input"
          placeholder={t("categories.add.placeholder.en")}
          value={draftEn}
          onChange={(e) => setDraftEn(e.target.value)}
          maxLength={48}
          aria-label={t("categories.add.aria.en")}
        />
        <button type="submit" className="btn-primary" disabled={!draftEs.trim()}>
          <Icon.plus /> {t("categories.add.submit")}
        </button>
      </form>
      {error && (
        <p className="categories-error" role="alert">
          {error}
        </p>
      )}

      <div className="admin-section-head">
        <h3>{t("categories.section.builtin")}</h3>
        <span className="admin-trash-count">
          {t("categories.count", { count: builtIns.length })}
        </span>
      </div>
      <ul className="categories-list">
        {builtIns.map((c) => {
          const hidden = isHidden(c.id);
          const labelEs = categoryLabelEs(c);
          return (
            <li key={c.id} className={`categories-row${hidden ? " is-hidden" : ""}`}>
              <span className="categories-row-label">{labelEs}</span>
              <span className="categories-row-id">{c.id}</span>
              <span className="categories-row-count">
                {(() => {
                  const n = caseCounts[c.id] ?? 0;
                  return t(n === 1 ? "categories.row.cases.one" : "categories.row.cases.many", {
                    count: n,
                  });
                })()}
              </span>
              <span className="categories-row-actions">
                <button
                  type="button"
                  className={`categories-visibility-toggle${hidden ? " is-hidden" : ""}`}
                  onClick={() => setHidden(c.id, !hidden)}
                  aria-label={
                    hidden
                      ? t("categories.row.toggleVisible", { label: labelEs })
                      : t("categories.row.toggleHidden", { label: labelEs })
                  }
                  aria-pressed={!hidden}
                  title={
                    hidden
                      ? t("categories.row.toggleVisible.title")
                      : t("categories.row.toggleHidden.title")
                  }
                >
                  {hidden ? "🚫" : "👁"}
                </button>
                <span className="categories-row-locked-label">
                  {t("categories.row.builtin.tag")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="admin-section-head">
        <h3>{t("categories.section.custom")}</h3>
        <span className="admin-trash-count">
          {t("categories.count", { count: customs.length })}
        </span>
      </div>
      {customs.length === 0 ? (
        <p className="categories-empty">{t("categories.empty")}</p>
      ) : (
        <ul className="categories-list">
          {customs.map((c) => {
            const isEditing = editingId === c.id;
            const inUse = caseCounts[c.id] ?? 0;
            const hidden = isHidden(c.id);
            const labelEs = categoryLabelEs(c);
            const labelEn = categoryLabelEn(c.label);
            return (
              <li key={c.id} className={`categories-row${hidden ? " is-hidden" : ""}`}>
                {isEditing ? (
                  <span className="categories-row-bilingual-edit">
                    <input
                      type="text"
                      autoFocus
                      className="admin-input categories-row-input"
                      value={editingEs}
                      onChange={(e) => setEditingEs(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      maxLength={48}
                      aria-label={t("categories.row.rename.es.aria", { label: labelEs })}
                      placeholder={t("categories.row.rename.placeholder.es")}
                    />
                    <input
                      type="text"
                      className="admin-input categories-row-input"
                      value={editingEn}
                      onChange={(e) => setEditingEn(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      maxLength={48}
                      aria-label={t("categories.row.rename.en.aria", { label: labelEs })}
                      placeholder={t("categories.row.rename.placeholder.en")}
                    />
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={commitEdit}
                      title={t("categories.row.save.title")}
                    >
                      {t("categories.row.save")}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={cancelEdit}
                      title={t("categories.row.cancel.title")}
                    >
                      {t("categories.row.cancel")}
                    </button>
                  </span>
                ) : (
                  <span className="categories-row-label">
                    {labelEs}
                    {labelEn && (
                      <span
                        className="categories-row-translation"
                        title={t("categories.row.translation.title")}
                      >
                        · {labelEn}
                      </span>
                    )}
                  </span>
                )}
                <span className="categories-row-id">{c.id}</span>
                <span className="categories-row-count">
                  {t(inUse === 1 ? "categories.row.cases.one" : "categories.row.cases.many", {
                    count: inUse,
                  })}
                </span>
                <span className="categories-row-actions">
                  {!isEditing && (
                    <>
                      <button
                        type="button"
                        className={`categories-visibility-toggle${hidden ? " is-hidden" : ""}`}
                        onClick={() => setHidden(c.id, !hidden)}
                        aria-label={
                          hidden
                            ? t("categories.row.toggleVisible", { label: labelEs })
                            : t("categories.row.toggleHidden", { label: labelEs })
                        }
                        aria-pressed={!hidden}
                        title={
                          hidden
                            ? t("categories.row.toggleVisible.title")
                            : t("categories.row.toggleHidden.title")
                        }
                      >
                        {hidden ? "🚫" : "👁"}
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => startEdit(c)}
                        aria-label={t("categories.row.rename.aria", { label: labelEs })}
                        title={t("categories.row.rename.title")}
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
                              t(
                                inUse === 1
                                  ? "categories.row.delete.confirm.one"
                                  : "categories.row.delete.confirm.many",
                                { label: labelEs, count: inUse, id: c.id },
                              ),
                            )
                          )
                            return;
                          // Fire the async remove. The undo toast
                          // (set up in App.tsx wrapper) lets the admin
                          // walk back if the click was a slip.
                          void onRemove(c.id);
                        }}
                        aria-label={t("categories.row.delete.aria", { label: labelEs })}
                        title={t("categories.row.delete.title")}
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
