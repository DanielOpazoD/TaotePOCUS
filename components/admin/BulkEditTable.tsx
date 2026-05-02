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
  /** Open the full CaseForm modal for one case. Used by the
   *  per-row "Abrir modal" action when the admin wants to edit
   *  fields the table doesn't expose (media, focus, loop, etc.). */
  onOpenEdit?: (c: CaseRecord) => void;
  /** Soft-delete a single case (with confirm + undo). */
  onDelete?: (c: CaseRecord) => void;
}

type SortField = "title" | "description" | "category" | "reviewed" | null;
type SortDir = "asc" | "desc";

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZES = [25, 50, 100, 200];

export default function BulkEditTable({
  cases,
  categories,
  onPatch,
  onBulkPatch,
  onBulkSoftDelete,
  onOpenEdit,
  onDelete,
}: Props) {
  // ─── Filters ───────────────────────────────────────────────────
  const [filterSection, setFilterSection] = useState<SectionId | "">("");
  const [filterCat, setFilterCat] = useState<string>("");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_DEFAULT);
  const [page, setPage] = useState(0);

  // ─── Sort ──────────────────────────────────────────────────────
  // null = natural order (the merged catalog's intrinsic sort).
  // Click on a sortable header cycles: null → asc → desc → null.
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const cycleSort = (field: NonNullable<SortField>) => {
    if (sortField !== field) {
      setSortField(field);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
      return;
    }
    setSortField(null);
    setSortDir("asc");
  };

  // ─── Selection ─────────────────────────────────────────────────
  // Tracked as a Set so add/remove is O(1) and the UI doesn't
  // re-render every row when a single one toggles.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ─── Keyboard nav state ───────────────────────────────────────
  // Index (within the current page) of the row that has visual
  // "focus" for j/k navigation. -1 means none. Manipulated only
  // through the keyboard; mouse interactions don't touch it so
  // clicking around doesn't mess with the keyboard cursor.
  const [activeRow, setActiveRow] = useState<number>(-1);
  const tableRef = useRef<HTMLTableElement>(null);

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

  // Apply sort over the filtered set. Memoized so unrelated state
  // changes (e.g., selection toggles) don't re-sort.
  const sorted = useMemo(() => {
    if (!sortField) return filtered;
    const arr = [...filtered];
    const cmp = (a: CaseRecord, b: CaseRecord): number => {
      let av: string | number;
      let bv: string | number;
      if (sortField === "title") {
        av = a.title;
        bv = b.title;
      } else if (sortField === "description") {
        av = getDescription(a);
        bv = getDescription(b);
      } else if (sortField === "category") {
        // Show the user-facing label, not the id, so the sort
        // matches what the column actually displays.
        av = categories.find((c) => c.id === a.category)?.label ?? a.category;
        bv = categories.find((c) => c.id === b.category)?.label ?? b.category;
      } else {
        // reviewed
        av = a.reviewed ? 1 : 0;
        bv = b.reviewed ? 1 : 0;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv, "es", { sensitivity: "base" });
      }
      return (av as number) - (bv as number);
    };
    arr.sort(cmp);
    if (sortDir === "desc") arr.reverse();
    return arr;
  }, [filtered, sortField, sortDir, categories]);

  // Reset to page 0 when filters change so the user doesn't end up
  // looking at an empty page when the result set shrinks.
  const filterKey = `${filterSection}|${filterCat}|${query}|${pageSize}|${sortField}|${sortDir}`;
  useEffect(() => {
    setPage(0);
    setActiveRow(-1);
  }, [filterKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageStart = page * pageSize;
  const paged = sorted.slice(pageStart, pageStart + pageSize);

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

  // ─── Keyboard navigation ──────────────────────────────────────
  // j / k / ↓ / ↑ move the active row cursor.
  // x toggles selection of the active row.
  // Enter on the active row opens the full modal (when wired).
  // Suspended while focus is inside an editable input/textarea so
  // typing j/k inside a title or tags cell stays as text.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return;
      }
      // Only intercept when the table is in the DOM and visible.
      // (The component unmount path tears the listener down, so
      // this is a belt-and-suspenders no-op when the user is
      // looking at another admin tab.)
      if (!tableRef.current?.isConnected) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveRow((prev) => {
          const next = Math.min(paged.length - 1, prev < 0 ? 0 : prev + 1);
          return next;
        });
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveRow((prev) => {
          if (prev <= 0) return 0;
          return prev - 1;
        });
        return;
      }
      if (e.key === "x" && activeRow >= 0 && paged[activeRow]) {
        e.preventDefault();
        toggleOne(paged[activeRow].id);
        return;
      }
      if (e.key === "Enter" && activeRow >= 0 && paged[activeRow] && onOpenEdit) {
        e.preventDefault();
        onOpenEdit(paged[activeRow]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paged, activeRow, onOpenEdit]);

  // Scroll the active row into view as it changes via keyboard.
  useEffect(() => {
    if (activeRow < 0 || !tableRef.current) return;
    const rows = tableRef.current.querySelectorAll<HTMLTableRowElement>("tbody tr.bulk-edit-row");
    rows[activeRow]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeRow]);

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
        <table className="bulk-edit-table" ref={tableRef}>
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
              <SortHeader
                field="title"
                active={sortField === "title"}
                dir={sortDir}
                onClick={cycleSort}
              >
                Título
              </SortHeader>
              <SortHeader
                field="description"
                active={sortField === "description"}
                dir={sortDir}
                onClick={cycleSort}
              >
                Descripción
              </SortHeader>
              <SortHeader
                field="category"
                active={sortField === "category"}
                dir={sortDir}
                onClick={cycleSort}
                className="bulk-edit-th-cat"
              >
                Categoría
              </SortHeader>
              <th className="bulk-edit-th-tags">Etiquetas</th>
              <SortHeader
                field="reviewed"
                active={sortField === "reviewed"}
                dir={sortDir}
                onClick={cycleSort}
                className="bulk-edit-th-reviewed"
                title="Marcado como revisado"
              >
                ✓
              </SortHeader>
              <th className="bulk-edit-th-actions"></th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c, i) => (
              <Row
                key={c.id}
                caso={c}
                categories={categories}
                checked={selected.has(c.id)}
                isActive={i === activeRow}
                onCheck={() => toggleOne(c.id)}
                onPatch={onPatch}
                onOpenEdit={onOpenEdit}
                onDelete={onDelete}
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
  isActive: boolean;
  onCheck: () => void;
  onPatch: (id: string, patch: Partial<CaseRecord>) => Promise<void> | void;
  onOpenEdit?: (c: CaseRecord) => void;
  onDelete?: (c: CaseRecord) => void;
}

function Row({
  caso,
  categories,
  checked,
  isActive,
  onCheck,
  onPatch,
  onOpenEdit,
  onDelete,
}: RowProps) {
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
        <Thumb caso={caso} onOpen={onOpenEdit ? () => onOpenEdit(caso) : undefined} />
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
      <td className="bulk-edit-td-actions">
        <RowMenu caso={caso} onOpenEdit={onOpenEdit} onDelete={onDelete} />
      </td>
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Thumbnail cell — image / video with error fallback + click-to-edit
// ═══════════════════════════════════════════════════════════════════

interface ThumbProps {
  caso: CaseRecord;
  /** When provided, the thumbnail becomes a clickable button that
   *  opens the full edit flow (CaseForm modal). Without it the
   *  thumb renders as a static <span>. */
  onOpen?: () => void;
}

/**
 * Per-row media thumbnail. Three states:
 *
 *   - Image present + load OK → 40×40 cropped image.
 *   - Video present + load OK → 40×40 muted video frame.
 *   - Anything fails (404, blob missing, CORS, network) → ◎ marker.
 *
 * The `onError` handlers flip a local state so the broken asset
 * doesn't keep retrying. Without this fallback `<Image>` and
 * `<video>` render an empty box on failure — visually invisible
 * and confusing.
 *
 * Click semantics:
 *   - With `onOpen`: the wrapper is a <button>. Click opens the
 *     full-edit modal (the same callback the row's ⋮ "Abrir
 *     modal completo" uses). Hover shows a subtle ring so the
 *     admin knows it's interactive.
 *   - Without: static container, no cursor change.
 */
function Thumb({ caso, onOpen }: ThumbProps) {
  const [errored, setErrored] = useState(false);

  const inner = (() => {
    if (errored || !caso.media) {
      return (
        <span className="bulk-edit-thumb-placeholder" aria-hidden="true">
          ◎
        </span>
      );
    }
    // Renderer dispatch follows the actual file extension, not the
    // declared `media.kind`. Twitter's "animated_gif" upload type is
    // shipped as `.mp4` but recorded as `kind: "image"` in the
    // imported corpus — handing that to `<Image>` makes the
    // optimizer choke (it can't decode an mp4 as an image) and the
    // tile renders empty. Same disambiguation as `CineLoop`.
    const src = caso.media.src;
    const isVideoFile = caso.media.kind === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src);
    if (isVideoFile) {
      return (
        <video
          src={src}
          muted
          playsInline
          preload="metadata"
          className="bulk-edit-thumb-media"
          onError={() => setErrored(true)}
        />
      );
    }
    return (
      <Image
        src={src}
        alt=""
        width={40}
        height={40}
        // Animated GIFs trip the Next.js optimizer (it produces
        // single-frame stills + content-type mismatches at tiny
        // sizes). Bypass for `.gif` matches CineLoop's policy and
        // makes the chip identical to what Atlas shows.
        unoptimized={/\.gif(\?|$)/i.test(src)}
        className="bulk-edit-thumb-media"
        onError={() => setErrored(true)}
      />
    );
  })();

  if (!onOpen) return inner;
  return (
    <button
      type="button"
      className="bulk-edit-thumb-btn"
      onClick={onOpen}
      aria-label={`Abrir edición completa de ${caso.title}`}
    >
      {inner}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sortable column header
// ═══════════════════════════════════════════════════════════════════

interface SortHeaderProps {
  field: NonNullable<SortField>;
  active: boolean;
  dir: SortDir;
  onClick: (field: NonNullable<SortField>) => void;
  className?: string;
  title?: string;
  children: React.ReactNode;
}

function SortHeader({ field, active, dir, onClick, className, title, children }: SortHeaderProps) {
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "";
  return (
    <th className={className} title={title}>
      <button
        type="button"
        className={"bulk-edit-sort-btn" + (active ? " is-active" : "")}
        onClick={() => onClick(field)}
        aria-label={`Ordenar por ${field}`}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <span>{children}</span>
        <span className="bulk-edit-sort-arrow" aria-hidden="true">
          {arrow}
        </span>
      </button>
    </th>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Row action menu (⋮)
// ═══════════════════════════════════════════════════════════════════

interface RowMenuProps {
  caso: CaseRecord;
  onOpenEdit?: (c: CaseRecord) => void;
  onDelete?: (c: CaseRecord) => void;
}

function RowMenu({ caso, onOpenEdit, onDelete }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click. Listener attached only while the menu
  // is open so passive viewing has no extra cost.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!onOpenEdit && !onDelete) return null;

  return (
    <div className="bulk-edit-rowmenu" ref={ref}>
      <button
        type="button"
        className="bulk-edit-rowmenu-trigger"
        aria-label="Más acciones"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋮
      </button>
      {open && (
        <div className="bulk-edit-rowmenu-panel" role="menu">
          {onOpenEdit && (
            <button
              type="button"
              className="bulk-edit-rowmenu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenEdit(caso);
              }}
            >
              Abrir modal completo
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="bulk-edit-rowmenu-item bulk-edit-rowmenu-item--danger"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete(caso);
              }}
            >
              Eliminar caso
            </button>
          )}
        </div>
      )}
    </div>
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
