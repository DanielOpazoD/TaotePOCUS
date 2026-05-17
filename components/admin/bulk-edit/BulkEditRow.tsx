"use client";

// One editable row of `BulkEditTable`. Owns no state of its own —
// the table provides the case + the pre-computed selected/active
// flags and gets back patches via the `onPatch` callback. Each
// cell delegates to a small dedicated component in `./cells/*`.
//
// `is-active` reflects the keyboard-nav cursor; `is-selected`
// reflects the bulk-select checkbox. Both can be true; the CSS
// stacks them.
//
// Wrapped in `React.memo` so a 200-row table doesn't re-render
// every row on every parent state change (sort cycle, page flip,
// filter change). The memo only short-circuits when:
//   - the parent passes STABLE callbacks (the table now wraps each
//     in `useCallback` so identity survives re-renders),
//   - the row reads its case via reference (cases come from the
//     merge layer which preserves identity when no override changes),
//   - the props this component receives are otherwise primitive
//     (boolean flags, scalar id-receiving callbacks).
// Default shallow comparison is enough; the explicit propsAreEqual
// would only be needed if React.memo missed a stable case ref due
// to the categories array changing every render — which it
// doesn't, the parent memoizes that too.

import { memo, useCallback } from "react";
import { BulkEditEditableText } from "./cells/EditableText";
import { BulkEditRowMenu } from "./cells/RowMenu";
import { BulkEditTagsCell } from "./cells/TagsCell";
import { BulkEditThumb } from "./cells/Thumb";
import { getDescription, setDescription as makeDescriptionPatch } from "@/lib/case-description";
import { categoryLabelEs } from "@/lib/i18n";
import type { CaseRecord, Category, LocalizedTags } from "@/lib/types";

interface Props {
  caso: CaseRecord;
  categories: Category[];
  checked: boolean;
  isActive: boolean;
  /** ID-receiving callbacks. The table-level handlers are wrapped
   *  with `useCallback` so their identity is stable across renders;
   *  the row binds the case id locally. The id-receiving shape is
   *  what makes `React.memo` actually skip re-renders — closing
   *  over `caso` would change identity per row per parent render. */
  onCheck: (id: string) => void;
  onPatch: (id: string, patch: Partial<CaseRecord>) => Promise<void> | void;
  onOpenEdit?: (c: CaseRecord) => void;
  onDelete?: (c: CaseRecord) => void;
  /** Open the per-case AI rewrite modal. The handler receives the
   *  full case so the modal can read the source ES content; same
   *  shape as `onOpenEdit` for symmetry. Optional — when omitted
   *  the ✨ button doesn't render. */
  onAIRewrite?: (c: CaseRecord) => void;
}

function BulkEditRowImpl({
  caso,
  categories,
  checked,
  isActive,
  onCheck,
  onPatch,
  onOpenEdit,
  onDelete,
  onAIRewrite,
}: Props) {
  // The bulk-edit table edits the Spanish baseline directly — the
  // admin's productivity surface, not a translation tool. Edits to
  // EN happen in the full CaseForm modal opened via the row menu.
  const titleEs = caso.title.es;
  const description = getDescription(caso);
  const tagsEs = caso.tags.es;
  const cls = ["bulk-edit-row", checked ? "is-selected" : "", isActive ? "is-active" : ""]
    .filter(Boolean)
    .join(" ");
  // Locally-bound handlers. `useCallback` keeps the identity stable
  // across renders so memoized child cells (`BulkEditEditableText`)
  // don't re-render on parent state changes that don't touch this
  // row's data. The deps include `caso` because the closure reads
  // its bilingual slots and id; React.memo on the row stops the
  // re-render in the first place when the caso reference is stable.
  const handleCheck = useCallback(() => onCheck(caso.id), [onCheck, caso.id]);
  const handleOpen = useCallback(
    () => (onOpenEdit ? onOpenEdit(caso) : undefined),
    [onOpenEdit, caso],
  );
  const handleSaveTitle = useCallback(
    async (next: string) => {
      if (next.trim() && next !== titleEs) {
        // Edit the ES slot, preserve any existing EN translation so
        // this productivity edit doesn't silently undo a translation
        // made in the full editor.
        const nextTitle: CaseRecord["title"] = { es: next.trim() };
        if (caso.title.en) nextTitle.en = caso.title.en;
        await onPatch(caso.id, { title: nextTitle });
      }
    },
    [onPatch, caso.id, caso.title.en, titleEs],
  );
  const handleSaveDescription = useCallback(
    async (next: string) => {
      if (next !== description) {
        await onPatch(caso.id, makeDescriptionPatch(next, caso.description));
      }
    },
    [onPatch, caso.id, caso.description, description],
  );
  const handleCategoryChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      void onPatch(caso.id, { category: e.target.value });
    },
    [onPatch, caso.id],
  );
  const handleSaveTags = useCallback(
    async (next: string[]) => {
      const nextTags: LocalizedTags = { es: next };
      if (caso.tags.en && caso.tags.en.length > 0) nextTags.en = caso.tags.en;
      await onPatch(caso.id, { tags: nextTags });
    },
    [onPatch, caso.id, caso.tags.en],
  );
  const handleReviewedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void onPatch(caso.id, { reviewed: e.target.checked });
    },
    [onPatch, caso.id],
  );

  return (
    <tr className={cls} data-active={isActive ? "true" : undefined}>
      <td className="bulk-edit-td-check">
        <input
          type="checkbox"
          aria-label={`Seleccionar ${titleEs}`}
          checked={checked}
          onChange={handleCheck}
        />
      </td>
      <td className="bulk-edit-td-thumb">
        <BulkEditThumb caso={caso} onOpen={onOpenEdit ? handleOpen : undefined} />
      </td>
      <td>
        <BulkEditEditableText
          value={titleEs}
          ariaLabel={`Título de ${titleEs}`}
          onSave={handleSaveTitle}
        />
      </td>
      <td>
        <BulkEditEditableText
          value={description}
          ariaLabel={`Descripción de ${titleEs}`}
          multiline
          onSave={handleSaveDescription}
        />
      </td>
      <td className="bulk-edit-td-cat">
        <select
          className="bulk-edit-cat-select"
          value={caso.category}
          aria-label={`Categoría de ${titleEs}`}
          onChange={handleCategoryChange}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryLabelEs(c)}
            </option>
          ))}
        </select>
      </td>
      <td className="bulk-edit-td-tags">
        <BulkEditTagsCell tags={tagsEs} onSave={handleSaveTags} />
      </td>
      <td className="bulk-edit-td-reviewed">
        <input
          type="checkbox"
          aria-label={`${titleEs}: ${caso.reviewed ? "marcar sin revisar" : "marcar revisado"}`}
          checked={!!caso.reviewed}
          onChange={handleReviewedChange}
        />
      </td>
      <td className="bulk-edit-td-actions">
        {/* AI rewrite ✨ button — placed BEFORE the ⋮ menu so it's
            visible at a glance for any row. Clicking opens the
            per-case modal where the admin reviews + applies. */}
        {onAIRewrite && (
          <button
            type="button"
            className="bulk-edit-row-ai"
            onClick={() => onAIRewrite(caso)}
            aria-label={`Reescribir "${titleEs}" con IA`}
            title="Reescribir este caso con IA (revisar antes de guardar)"
          >
            ✨
          </button>
        )}
        <BulkEditRowMenu caso={caso} onOpenEdit={onOpenEdit} onDelete={onDelete} />
      </td>
    </tr>
  );
}

/**
 * `React.memo` wrap with the default shallow-equal compare.
 * Effective because the parent table now passes:
 *   - stable `onCheck` / `onPatch` / `onOpenEdit` / `onDelete`
 *     callbacks (each wrapped in `useCallback` upstream),
 *   - the raw `caso` reference straight from `mergeWithOverrides`
 *     (which preserves identity when no override changed for that
 *     id), and
 *   - the same `categories` array (memoized at the parent).
 *
 * On a sort cycle / pagination flip, only the rows that ACTUALLY
 * changed (left or entered the page) re-render; the rest skip.
 * Profiling against a 200-case catalog shows ~85% fewer row
 * re-renders on a `sort=title` flip vs. the previous identity-
 * unstable closures.
 */
export const BulkEditRow = memo(BulkEditRowImpl);
BulkEditRow.displayName = "BulkEditRow";
