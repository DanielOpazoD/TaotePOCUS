"use client";

// Bulk edit table — the admin's productivity tool for editing many
// cases at once without round-tripping through the full CaseForm
// modal. Inspired by the spreadsheet UX of Notion / Airtable / Linear.
//
// Layout (left → right): select checkbox · 40×40 thumb · title ·
// description (2-line clamp) · category dropdown · tags chip cell ·
// reviewed checkbox · delete action.
//
// Save model: every cell auto-saves on blur or change. The patch
// goes through the parent's `onPatch` (which already wraps
// `setOverride` with an undo toast — see `App.tsx`). Failures
// surface via the toast layer; the cell reverts visually.
//
// Filters + pagination keep the table responsive even with the
// 199-case corpus. The filter bar mirrors the public catalog
// vocabulary (section, category, search) so the admin's mental
// model is the same.

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { SECTIONS, COMMON_TAGS } from "@/lib/data";
import { getDescription, setDescription as makeDescriptionPatch } from "@/lib/case-description";
import type { CaseRecord, Category, SectionId } from "@/lib/types";

interface Props {
  cases: CaseRecord[];
  categories: Category[];
  /** Apply a partial override to a single case. Wired in App.tsx
   *  to `setOverride` + undo toast. Same callback used by the
   *  classifier and the AdminThumbMenu. */
  onPatch: (id: string, patch: Partial<CaseRecord>) => Promise<void> | void;
  /** Apply the same patch to many cases. Used by the bulk action
   *  bar at the bottom of the table. */
  onBulkPatch: (ids: string[], patch: Partial<CaseRecord>) => Promise<void> | void;
  /** Soft-delete every selected case at once. */
  onBulkSoftDelete: (ids: string[]) => Promise<void> | void;
}

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZES = [25, 50, 100, 200];

export default function BulkEditTable({
  cases,
  categories,
  onPatch,
  onBulkPatch,
  onBulkSoftDelete,
}: Props) {
  // ─── Filters ───────────────────────────────────────────────────
  const [filterSection, setFilterSection] = useState<SectionId | "">("");
  const [filterCat, setFilterCat] = useState<string>("");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_DEFAULT);
  const [page, setPage] = useState(0);

  // ─── Selection ─────────────────────────────────────────────────
  // Tracked as a Set so add/remove is O(1) and the UI doesn't
  // re-render every row when a single one toggles.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filter pipeline — same vocab as the public catalog. We avoid
  // pulling in `useCaseFilters` because that hook is opinionated
  // about sort/sectionTags/sectionCategories which we don't need
  // here.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter((c) => {
      if (c.deletedAt) return false; // trashed: not shown here
      if (filterSection && c.section !== filterSection) return false;
      if (filterCat && c.category !== filterCat) return false;
      if (q) {
        const hay =
          c.title.toLowerCase().includes(q) ||
          getDescription(c).toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [cases, filterSection, filterCat, query]);

  // Reset to page 0 when filters change so the user doesn't end up
  // looking at an empty page when the result set shrinks.
  const filterKey = `${filterSection}|${filterCat}|${query}|${pageSize}`;
  useEffect(() => {
    setPage(0);
  }, [filterKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageStart = page * pageSize;
  const paged = filtered.slice(pageStart, pageStart + pageSize);

  // Selection helpers — kept tight so the bulk bar can show
  // counts without re-traversing.
  const visibleIds = useMemo(() => paged.map((c) => c.id), [paged]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  // ─── Bulk actions ──────────────────────────────────────────────
  const applyBulkSection = async (section: SectionId) => {
    const ids = Array.from(selected);
    await onBulkPatch(ids, { section });
  };
  const applyBulkCategory = async (category: string) => {
    const ids = Array.from(selected);
    await onBulkPatch(ids, { category });
  };
  const applyBulkReviewed = async (reviewed: boolean) => {
    const ids = Array.from(selected);
    await onBulkPatch(ids, { reviewed });
  };
  const applyBulkDelete = async () => {
    if (
      !window.confirm(
        `Mover ${selected.size} caso${selected.size === 1 ? "" : "s"} a la papelera? La acción se puede deshacer.`,
      )
    )
      return;
    const ids = Array.from(selected);
    await onBulkSoftDelete(ids);
    clearSelection();
  };

  return (
    <div className="bulk-edit">
      {/* ─── Header bar: filters + counts ───────────────────────── */}
      <div className="bulk-edit-head">
        <div className="bulk-edit-filters" role="search" aria-label="Filtros">
          <select
            className="bulk-edit-filter"
            aria-label="Sección"
            value={filterSection}
            onChange={(e) => setFilterSection(e.target.value as SectionId | "")}
          >
            <option value="">Todas las secciones</option>
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className="bulk-edit-filter"
            aria-label="Categoría"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="search"
            className="bulk-edit-search"
            placeholder="Buscar por título, descripción o etiqueta…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar en la tabla"
          />
        </div>
        <div className="bulk-edit-meta">
          <select
            className="bulk-edit-filter"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Casos por página"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} / página
              </option>
            ))}
          </select>
          <span className="bulk-edit-count">
            {pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} de {filtered.length}
          </span>
        </div>
      </div>

      {/* ─── Table ──────────────────────────────────────────────── */}
      <div className="bulk-edit-scroll">
        <table className="bulk-edit-table">
          <thead>
            <tr>
              <th className="bulk-edit-th-check">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos los visibles"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
              </th>
              <th className="bulk-edit-th-thumb"></th>
              <th>Título</th>
              <th>Descripción</th>
              <th className="bulk-edit-th-cat">Categoría</th>
              <th className="bulk-edit-th-tags">Etiquetas</th>
              <th className="bulk-edit-th-reviewed" title="Marcado como revisado">
                ✓
              </th>
              <th className="bulk-edit-th-actions"></th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c) => (
              <Row
                key={c.id}
                caso={c}
                categories={categories}
                checked={selected.has(c.id)}
                onCheck={() => toggleOne(c.id)}
                onPatch={onPatch}
              />
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={8} className="bulk-edit-empty">
                  No hay casos que coincidan con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Pagination ─────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="bulk-edit-pagination">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ← Anterior
          </button>
          <span className="bulk-edit-page-indicator">
            Página {page + 1} de {totalPages}
          </span>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* ─── Bulk action bar (sticky bottom) ─────────────────────── */}
      {someSelected && (
        <div className="bulk-edit-actionbar" role="toolbar" aria-label="Acciones en lote">
          <span className="bulk-edit-actionbar-count">
            {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
          </span>
          <select
            className="bulk-edit-filter"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                void applyBulkSection(e.target.value as SectionId);
                e.target.value = "";
              }
            }}
            aria-label="Cambiar sección de seleccionados"
          >
            <option value="">Cambiar sección…</option>
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                → {s.label}
              </option>
            ))}
          </select>
          <select
            className="bulk-edit-filter"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                void applyBulkCategory(e.target.value);
                e.target.value = "";
              }
            }}
            aria-label="Cambiar categoría de seleccionados"
          >
            <option value="">Cambiar categoría…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                → {c.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={() => void applyBulkReviewed(true)}>
            ✓ Marcar revisado
          </button>
          <button type="button" className="btn-ghost" onClick={() => void applyBulkReviewed(false)}>
            ✗ Sin marcar
          </button>
          <button
            type="button"
            className="btn-danger bulk-edit-actionbar-delete"
            onClick={() => void applyBulkDelete()}
          >
            {Icon.trash()} Eliminar
          </button>
          <button type="button" className="btn-ghost" onClick={clearSelection}>
            Limpiar
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Row — one editable case
// ═══════════════════════════════════════════════════════════════════

interface RowProps {
  caso: CaseRecord;
  categories: Category[];
  checked: boolean;
  onCheck: () => void;
  onPatch: (id: string, patch: Partial<CaseRecord>) => Promise<void> | void;
}

function Row({ caso, categories, checked, onCheck, onPatch }: RowProps) {
  const description = getDescription(caso);
  return (
    <tr className={checked ? "bulk-edit-row is-selected" : "bulk-edit-row"}>
      <td className="bulk-edit-td-check">
        <input
          type="checkbox"
          aria-label={`Seleccionar ${caso.title}`}
          checked={checked}
          onChange={onCheck}
        />
      </td>
      <td className="bulk-edit-td-thumb">
        {caso.media?.kind === "video" ? (
          <video src={caso.media.src} muted className="bulk-edit-thumb-media" />
        ) : caso.media ? (
          <Image
            src={caso.media.src}
            alt=""
            width={40}
            height={40}
            className="bulk-edit-thumb-media"
          />
        ) : (
          <div className="bulk-edit-thumb-placeholder" aria-hidden="true">
            ◎
          </div>
        )}
      </td>
      <td>
        <EditableText
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
        <EditableText
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
        <TagsCell
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
      <td className="bulk-edit-td-actions" />
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Editable text cell — title + description
// ═══════════════════════════════════════════════════════════════════

interface EditableTextProps {
  value: string;
  ariaLabel: string;
  multiline?: boolean;
  onSave: (next: string) => Promise<void> | void;
}

function EditableText({ value, ariaLabel, multiline, onSave }: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Keep `draft` in sync when the source value changes externally
  // (e.g., parent re-renders with a fresher `caso.title` after a
  // server-confirmed save).
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 800);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={
          "bulk-edit-cell-display" +
          (multiline ? " is-multiline" : "") +
          (savedFlash ? " is-saved-flash" : "")
        }
        aria-label={`${ariaLabel} (click para editar)`}
        onClick={() => setEditing(true)}
      >
        {value || <span className="bulk-edit-cell-empty">— vacío —</span>}
      </button>
    );
  }

  if (multiline) {
    return (
      <textarea
        autoFocus
        className="bulk-edit-cell-input is-multiline"
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
          // Cmd/Ctrl + Enter saves; plain Enter inserts newline.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
        }}
        aria-label={ariaLabel}
        disabled={saving}
      />
    );
  }
  return (
    <input
      autoFocus
      type="text"
      className="bulk-edit-cell-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        }
      }}
      aria-label={ariaLabel}
      disabled={saving}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════
// Tags cell — chips on display, comma-separated input on edit
// ═══════════════════════════════════════════════════════════════════

interface TagsCellProps {
  tags: readonly string[];
  onSave: (next: string[]) => Promise<void> | void;
}

function TagsCell({ tags, onSave }: TagsCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tags.join(", "));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(tags.join(", "));
  }, [tags, editing]);

  const commit = async () => {
    const next = parseTagsInput(draft);
    const same = next.length === tags.length && next.every((t, i) => t === tags[i]);
    if (same) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const cancel = () => {
    setDraft(tags.join(", "));
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="bulk-edit-tags-display"
        aria-label="Editar etiquetas"
        onClick={() => {
          setEditing(true);
          // Focus after the input renders.
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        {tags.length === 0 ? (
          <span className="bulk-edit-cell-empty">— sin etiquetas —</span>
        ) : (
          tags.map((t) => (
            <span key={t} className="bulk-edit-tag-chip">
              {t}
            </span>
          ))
        )}
      </button>
    );
  }
  return (
    <input
      ref={inputRef}
      type="text"
      className="bulk-edit-cell-input"
      value={draft}
      list="bulk-edit-tag-suggestions"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        }
      }}
      aria-label="Etiquetas separadas por coma"
      placeholder="ej: B-líneas, Patológico"
      disabled={saving}
    />
  );
}

/** Parse a comma-separated tag string into a unique, trimmed array. */
function parseTagsInput(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const piece of raw.split(",")) {
    const t = piece.trim();
    if (!t) continue;
    if (seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    result.push(t);
  }
  return result;
}

// Static datalist for tag suggestions — rendered once at the bottom
// of the table so all rows share it. Includes the curated catalog
// vocabulary; in-use tags from existing cases would require lifting
// state, which we skip for now (auto-complete still works for most
// edits because COMMON_TAGS covers the common cases).
export function BulkEditTagSuggestions() {
  return (
    <datalist id="bulk-edit-tag-suggestions">
      {COMMON_TAGS.map((t) => (
        <option key={t} value={t} />
      ))}
    </datalist>
  );
}
