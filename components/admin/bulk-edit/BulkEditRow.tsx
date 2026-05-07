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
import type { CaseRecord, Category } from "@/lib/types";

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
  const description = getDescription(caso);
  const cls = ["bulk-edit-row", checked ? "is-selected" : "", isActive ? "is-active" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <tr className={cls} data-active={isActive ? "true" : undefined}>
      <td className="bulk-edit-td-check">
        <input
          type="checkbox"
          aria-label={`Seleccionar ${caso.title}`}
          checked={checked}
          onChange={onCheck}
        />
      </td>
      <td className="bulk-edit-td-thumb">
        <BulkEditThumb caso={caso} onOpen={onOpenEdit ? () => onOpenEdit(caso) : undefined} />
      </td>
      <td>
        <BulkEditEditableText
          value={caso.title}
          ariaLabel={`Título de ${caso.title}`}
          onSave={async (next) => {
            if (next.trim() && next !== caso.title) {
              await onPatch(caso.id, { title: next.trim() });
            }
          }}
        />
      </td>
      <td>
        <BulkEditEditableText
          value={description}
          ariaLabel={`Descripción de ${caso.title}`}
          multiline
          onSave={async (next) => {
            if (next !== description) {
              await onPatch(caso.id, makeDescriptionPatch(next));
            }
          }}
        />
      </td>
      <td className="bulk-edit-td-cat">
        <select
          className="bulk-edit-cat-select"
          value={caso.category}
          aria-label={`Categoría de ${caso.title}`}
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
          tags={caso.tags}
          onSave={async (next) => {
            await onPatch(caso.id, { tags: next });
          }}
        />
      </td>
      <td className="bulk-edit-td-reviewed">
        <input
          type="checkbox"
          aria-label={`${caso.title}: ${caso.reviewed ? "marcar sin revisar" : "marcar revisado"}`}
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
