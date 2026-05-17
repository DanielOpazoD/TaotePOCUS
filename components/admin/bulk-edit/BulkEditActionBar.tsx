"use client";

// Sticky action bar that appears at the bottom of `BulkEditTable`
// once one or more rows are selected. Hosts the bulk operations:
// reclassify (section / category), tag-add / tag-remove, mark /
// unmark reviewed, delete, clear selection.
//
// Visually styled as an inverted pill that floats above the page
// — matches the toast geometry but with a different palette so the
// admin can distinguish "info / undo" from "this is a tool you're
// actively using". Stays out of the way until selection > 0.

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { SECTIONS } from "@/lib/data";
import { categoryLabelEs, sectionLabel } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import type { Category, SectionId } from "@/lib/types";

interface Props {
  selectedCount: number;
  categories: Category[];
  onApplySection: (s: SectionId) => void;
  onApplyCategory: (id: string) => void;
  onApplyReviewed: (reviewed: boolean) => void;
  onDelete: () => void;
  onClear: () => void;
  /** Frequency map (ES tag → count in selection). Drives the chip
   *  cloud in the expanded "Etiquetas" panel — each chip shows how
   *  many of the N selected cases currently carry that tag, plus
   *  a one-click "remove from all" action. */
  tagFrequencies: Map<string, number>;
  /** Add a tag to every selected case that doesn't already have it. */
  onApplyAddTag: (tag: string) => void;
  /** Remove a tag from every selected case that currently has it. */
  onApplyRemoveTag: (tag: string) => void;
  /** Open the AI bulk-rewrite modal with the current selection. */
  onAIRewriteBulk: () => void;
}

export function BulkEditActionBar({
  selectedCount,
  categories,
  onApplySection,
  onApplyCategory,
  onApplyReviewed,
  onDelete,
  onClear,
  tagFrequencies,
  onApplyAddTag,
  onApplyRemoveTag,
  onAIRewriteBulk,
}: Props) {
  const { lang, t } = useLanguage();
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const countLabel = t(
    selectedCount === 1 ? "bulk.selection.count.one" : "bulk.selection.count.many",
    { count: selectedCount },
  );
  // Frequency-sorted tag list — most-shared first so the admin sees
  // the dominant labels in the selection at a glance. Tied counts
  // preserve insertion order (effectively alphabetical from the
  // Map iteration order over a stable input).
  const tagsSorted = Array.from(tagFrequencies.entries()).sort((a, b) => b[1] - a[1]);
  const handleAddSubmit = () => {
    const t = tagInput.trim();
    if (!t) return;
    onApplyAddTag(t);
    setTagInput("");
  };
  return (
    <div className="bulk-edit-actionbar" role="toolbar" aria-label={t("bulk.selection.aria")}>
      <span className="bulk-edit-actionbar-count">{countLabel}</span>
      <select
        className="bulk-edit-filter"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            onApplySection(e.target.value as SectionId);
            e.target.value = "";
          }
        }}
        aria-label={t("bulk.action.changeSection.aria")}
      >
        <option value="">{t("bulk.action.changeSection")}</option>
        {SECTIONS.map((s) => (
          <option key={s.id} value={s.id}>
            → {sectionLabel(s.id, lang)}
          </option>
        ))}
      </select>
      <select
        className="bulk-edit-filter"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            onApplyCategory(e.target.value);
            e.target.value = "";
          }
        }}
        aria-label={t("bulk.action.changeCategory.aria")}
      >
        <option value="">{t("bulk.action.changeCategory")}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            → {categoryLabelEs(c)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={`btn-ghost${tagsOpen ? " is-active" : ""}`}
        onClick={() => setTagsOpen((v) => !v)}
        aria-expanded={tagsOpen}
        aria-controls="bulk-edit-tags-panel"
      >
        {t("bulk.action.tags")}
      </button>
      <button type="button" className="btn-ghost" onClick={() => onApplyReviewed(true)}>
        {t("bulk.action.markReviewed")}
      </button>
      <button type="button" className="btn-ghost" onClick={() => onApplyReviewed(false)}>
        {t("bulk.action.unmarkReviewed")}
      </button>
      <button
        type="button"
        className="btn-ghost bulk-edit-actionbar-ai"
        onClick={onAIRewriteBulk}
        title="Reescribir todos los seleccionados con IA siguiendo las reglas editoriales"
      >
        ✨ IA reescribir
      </button>
      <button type="button" className="btn-danger bulk-edit-actionbar-delete" onClick={onDelete}>
        {Icon.trash()} {t("bulk.action.delete")}
      </button>
      <button type="button" className="btn-ghost" onClick={onClear}>
        {t("bulk.action.clear")}
      </button>
      {tagsOpen && (
        // Expanded panel sits BELOW the action-bar row, breaks out
        // of the inline-flex layout via `flex-basis: 100%`. Hosts
        // the tag-frequency cloud + the add-new input. Closing the
        // panel via the toggle is reversible; the action-bar itself
        // stays around until the admin clears the selection.
        <div id="bulk-edit-tags-panel" className="bulk-edit-actionbar-tags">
          {tagsSorted.length > 0 && (
            <div className="bulk-edit-actionbar-tag-cloud" aria-label={t("bulk.tags.currentAria")}>
              {tagsSorted.map(([tag, count]) => (
                <button
                  key={tag}
                  type="button"
                  className="bulk-edit-actionbar-tag-chip"
                  onClick={() => onApplyRemoveTag(tag)}
                  title={t("bulk.tags.removeTitle", { tag, count })}
                >
                  <span className="bulk-edit-actionbar-tag-label">{tag}</span>
                  <span className="bulk-edit-actionbar-tag-count">{count}</span>
                  <span className="bulk-edit-actionbar-tag-remove" aria-hidden="true">
                    ✕
                  </span>
                </button>
              ))}
            </div>
          )}
          <form
            className="bulk-edit-actionbar-tag-add"
            onSubmit={(e) => {
              e.preventDefault();
              handleAddSubmit();
            }}
          >
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder={t("bulk.tags.addPlaceholder")}
              aria-label={t("bulk.tags.addAria")}
            />
            <button type="submit" className="btn-primary" disabled={!tagInput.trim()}>
              {t("bulk.tags.addSubmit", { count: selectedCount })}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
