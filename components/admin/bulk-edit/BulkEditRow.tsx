"use client";

// One editable row of `BulkEditTable`. Owns no state of its own —
// the table provides the case + the pre-computed selected/active
// flags and gets back patches via the `onPatch` callback. Each
// cell delegates to a small dedicated component in `./cells/*`.
//
// `is-active` reflects the keyboard-nav cursor; `is-selected`
// reflects the bulk-select checkbox. Both can be true; the CSS
// stacks them.

import { BulkEditEditableText } from "./cells/EditableText";
import { BulkEditRowMenu } from "./cells/RowMenu";
import { BulkEditTagsCell } from "./cells/TagsCell";
import { BulkEditThumb } from "./cells/Thumb";
import { getDescription, setDescription as makeDescriptionPatch } from "@/lib/case-description";
import type { CaseRecord, Category, LocalizedTags } from "@/lib/types";

interface Props {
  caso: CaseRecord;
  categories: Category[];
  checked: boolean;
  isActive: boolean;
  onCheck: () => void;
  onPatch: (id: string, patch: Partial<CaseRecord>) => Promise<void> | void;
  onOpenEdit?: (c: CaseRecord) => void;
  onDelete?: (c: CaseRecord) => void;
}

export function BulkEditRow({
  caso,
  categories,
  checked,
  isActive,
  onCheck,
  onPatch,
  onOpenEdit,
  onDelete,
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
  return (
    <tr className={cls} data-active={isActive ? "true" : undefined}>
      <td className="bulk-edit-td-check">
        <input
          type="checkbox"
          aria-label={`Seleccionar ${titleEs}`}
          checked={checked}
          onChange={onCheck}
        />
      </td>
      <td className="bulk-edit-td-thumb">
        <BulkEditThumb caso={caso} onOpen={onOpenEdit ? () => onOpenEdit(caso) : undefined} />
      </td>
      <td>
        <BulkEditEditableText
          value={titleEs}
          ariaLabel={`Título de ${titleEs}`}
          onSave={async (next) => {
            if (next.trim() && next !== titleEs) {
              // Edit the ES slot, preserve any existing EN translation
              // so this productivity edit doesn't silently undo a
              // translation made in the full editor.
              const nextTitle: CaseRecord["title"] = { es: next.trim() };
              if (caso.title.en) nextTitle.en = caso.title.en;
              await onPatch(caso.id, { title: nextTitle });
            }
          }}
        />
      </td>
      <td>
        <BulkEditEditableText
          value={description}
          ariaLabel={`Descripción de ${titleEs}`}
          multiline
          onSave={async (next) => {
            if (next !== description) {
              // `makeDescriptionPatch` already preserves the EN slot
              // when given the previous LocalizedString.
              await onPatch(caso.id, makeDescriptionPatch(next, caso.description));
            }
          }}
        />
      </td>
      <td className="bulk-edit-td-cat">
        <select
          className="bulk-edit-cat-select"
          value={caso.category}
          aria-label={`Categoría de ${titleEs}`}
          onChange={(e) => {
            void onPatch(caso.id, { category: e.target.value });
          }}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </td>
      <td className="bulk-edit-td-tags">
        <BulkEditTagsCell
          tags={tagsEs}
          onSave={async (next) => {
            // Replace the ES list, preserve EN so a quick tag edit
            // doesn't drop an existing translated tag set.
            const nextTags: LocalizedTags = { es: next };
            if (caso.tags.en && caso.tags.en.length > 0) nextTags.en = caso.tags.en;
            await onPatch(caso.id, { tags: nextTags });
          }}
        />
      </td>
      <td className="bulk-edit-td-reviewed">
        <input
          type="checkbox"
          aria-label={`${titleEs}: ${caso.reviewed ? "marcar sin revisar" : "marcar revisado"}`}
          checked={!!caso.reviewed}
          onChange={(e) => {
            void onPatch(caso.id, { reviewed: e.target.checked });
          }}
        />
      </td>
      <td className="bulk-edit-td-actions">
        <BulkEditRowMenu caso={caso} onOpenEdit={onOpenEdit} onDelete={onDelete} />
      </td>
    </tr>
  );
}
