"use client";

// Bulk edit table — the admin's productivity tool for editing many
// cases at once without round-tripping through the full CaseForm
// modal. Inspired by the spreadsheet UX of Notion / Airtable / Linear.
//
// This file is the **orchestrator**. It owns the table state
// (filters, sort, selection, pagination, keyboard cursor) and
// delegates rendering to small subcomponents:
//
//   ./cells/Thumb.tsx         — image / video / placeholder
//   ./cells/EditableText.tsx  — title + description inline edit
//   ./cells/TagsCell.tsx      — chip display + comma-separated edit
//   ./cells/SortHeader.tsx    — clickable header w/ asc/desc/none
//   ./cells/RowMenu.tsx       — ⋮ popover (open modal / delete)
//   BulkEditRow.tsx           — one row, composes the cells
//   BulkEditFilters.tsx       — top filter bar
//   BulkEditActionBar.tsx     — sticky bulk-action chip
//   BulkEditPagination.tsx    — page controls
//
// Save model: every cell auto-saves on blur or change. The patch
// goes through the parent's `onPatch` (which already wraps
// `setOverride` with an undo toast). Failures surface via the
// toast layer; the cell reverts visually.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BulkEditActionBar } from "./BulkEditActionBar";
import { BulkEditFilters } from "./BulkEditFilters";
import { BulkEditPagination } from "./BulkEditPagination";
import { BulkEditRow } from "./BulkEditRow";
import { BulkEditSortHeader } from "./cells/SortHeader";
import { AIRewriteModal } from "../ai/AIRewriteModal";
import { AIBulkRewriteModal } from "../ai/AIBulkRewriteModal";
import { getDescription } from "@/lib/case-description";
import { categoryLabelEs } from "@/lib/i18n";
import { useT } from "@/hooks/useLanguage";
import type { CaseRecord, Category, SectionId } from "@/lib/types";
import type { SortDir, SortField } from "./types";

interface Props {
  cases: CaseRecord[];
  categories: Category[];
  /** Apply a partial override to a single case. Wired in App.tsx
   *  to `setOverride` + undo toast. */
  onPatch: (id: string, patch: Partial<CaseRecord>) => Promise<void> | void;
  /** Apply the same patch to many cases. Used by the bulk action
   *  bar at the bottom of the table. */
  onBulkPatch: (ids: string[], patch: Partial<CaseRecord>) => Promise<void> | void;
  /** Soft-delete every selected case at once. */
  onBulkSoftDelete: (ids: string[]) => Promise<void> | void;
  /** Open the full CaseForm modal for one case. Used by the
   *  per-row "Abrir modal" action when the admin wants to edit
   *  fields the table doesn't expose. */
  onOpenEdit?: (c: CaseRecord) => void;
  /** Soft-delete a single case (with confirm + undo). */
  onDelete?: (c: CaseRecord) => void;
}

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZES = [25, 50, 100, 200] as const;

export default function BulkEditTable({
  cases,
  categories,
  onPatch,
  onBulkPatch,
  onBulkSoftDelete,
  onOpenEdit,
  onDelete,
}: Props) {
  const t = useT();
  // ─── Filters ───────────────────────────────────────────────────
  const [filterSection, setFilterSection] = useState<SectionId | "">("");
  const [filterCat, setFilterCat] = useState<string>("");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_DEFAULT);
  const [page, setPage] = useState(0);

  // ─── Sort ──────────────────────────────────────────────────────
  // null = natural order. Click cycles: null → asc → desc → null.
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
  // Set so add/remove is O(1) and the UI doesn't re-render every
  // row when a single one toggles.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ─── AI rewrite modal state ────────────────────────────────────
  // `aiTarget` is the case currently being rewritten via the per-row
  // ✨ button (single-case modal). `aiBulkOpen` is true while the
  // bulk modal is on screen with `selected` cases. The two are
  // independent — bulk uses the live selection set, single uses one
  // case explicitly chosen from a row.
  const [aiTarget, setAiTarget] = useState<CaseRecord | null>(null);
  const [aiBulkOpen, setAiBulkOpen] = useState(false);

  // ─── Keyboard nav state ───────────────────────────────────────
  const [activeRow, setActiveRow] = useState<number>(-1);
  const tableRef = useRef<HTMLTableElement>(null);

  // True if any filter narrows the set (even one that yields no
  // results). Drives the empty-state CTA — when filters are active,
  // we surface "Limpiar filtros"; when the catalog is genuinely
  // empty the message stays static (clearing nothing wouldn't help).
  const hasActiveFilters = filterSection !== "" || filterCat !== "" || query.trim() !== "";

  // Filter pipeline — admin-side, so we search across BOTH language
  // slots (title.es, title.en, description.es, description.en,
  // tags.es, tags.en). Lets the admin find a case by typing its
  // English title even though the visible cells show the Spanish
  // baseline.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter((c) => {
      if (c.deletedAt) return false;
      if (filterSection && c.section !== filterSection) return false;
      if (filterCat && c.category !== filterCat) return false;
      if (q) {
        const titleHay = `${c.title.es} ${c.title.en ?? ""}`.toLowerCase();
        const descHay = `${c.description.es} ${c.description.en ?? ""}`.toLowerCase();
        const tagHay = [...c.tags.es, ...(c.tags.en ?? [])].some((t) =>
          t.toLowerCase().includes(q),
        );
        if (!(titleHay.includes(q) || descHay.includes(q) || tagHay)) return false;
      }
      return true;
    });
  }, [cases, filterSection, filterCat, query]);

  // Apply sort over the filtered set.
  const sorted = useMemo(() => {
    if (!sortField) return filtered;
    const arr = [...filtered];
    const cmp = (a: CaseRecord, b: CaseRecord): number => {
      let av: string | number;
      let bv: string | number;
      if (sortField === "title") {
        // Sort by the Spanish slot — the bulk-edit table always
        // shows the ES title cell, so sorting by what's NOT visible
        // would surprise the admin. EN-translated cases sort with
        // their ES siblings.
        av = a.title.es;
        bv = b.title.es;
      } else if (sortField === "description") {
        av = getDescription(a);
        bv = getDescription(b);
      } else if (sortField === "category") {
        // Compare by user-facing label so the result matches what the
        // column actually displays. ES baseline only — matches what
        // every cell in the table renders.
        const catA = categories.find((c) => c.id === a.category);
        const catB = categories.find((c) => c.id === b.category);
        av = catA ? categoryLabelEs(catA) : a.category;
        bv = catB ? categoryLabelEs(catB) : b.category;
      } else {
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

  // Reset to page 0 when filters / sort / page-size change.
  const filterKey = `${filterSection}|${filterCat}|${query}|${pageSize}|${sortField}|${sortDir}`;
  useEffect(() => {
    setPage(0);
    setActiveRow(-1);
  }, [filterKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageStart = page * pageSize;
  const paged = sorted.slice(pageStart, pageStart + pageSize);

  // Selection helpers.
  const visibleIds = useMemo(() => paged.map((c) => c.id), [paged]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const id of visibleIds) next.delete(id);
      else for (const id of visibleIds) next.add(id);
      return next;
    });
  };
  // Stable identity across renders so memoized rows skip re-renders
  // on parent state changes (sort cycle, page flip, filter typing
  // that doesn't change the id set). Without `useCallback` the
  // closure identity changes every parent render and `React.memo`
  // on `BulkEditRow` would never short-circuit.
  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = () => setSelected(new Set());

  // Bulk actions wrap the parent props with the selected set.
  const applyBulkSection = (section: SectionId) => onBulkPatch(Array.from(selected), { section });
  const applyBulkCategory = (category: string) => onBulkPatch(Array.from(selected), { category });
  const applyBulkReviewed = (reviewed: boolean) => onBulkPatch(Array.from(selected), { reviewed });
  const applyBulkDelete = async () => {
    const msg = t(
      selected.size === 1 ? "bulk.action.confirmDelete.one" : "bulk.action.confirmDelete.many",
      { count: selected.size },
    );
    if (!window.confirm(msg)) return;
    await onBulkSoftDelete(Array.from(selected));
    clearSelection();
  };

  // Per-tag bulk operations. Unlike section / category / reviewed
  // (which apply the SAME patch to every selected case), tag
  // add/remove needs PER-CASE patches because each case has a
  // different current tag list. We iterate and call `onPatch` for
  // each id whose case actually changes — skipping no-ops (e.g.
  // "add tag X" to a case that already has X) keeps the override
  // map minimal + the undo toast sane.
  const tagFrequencies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of selected) {
      const c = cases.find((x) => x.id === id);
      if (!c) continue;
      for (const tag of c.tags.es) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [selected, cases]);

  const applyBulkAddTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    for (const id of selected) {
      const c = cases.find((x) => x.id === id);
      if (!c || c.tags.es.includes(trimmed)) continue;
      const nextEs = [...c.tags.es, trimmed];
      const nextTags =
        c.tags.en && c.tags.en.length > 0 ? { es: nextEs, en: c.tags.en } : { es: nextEs };
      void onPatch(id, { tags: nextTags });
    }
  };

  const applyBulkRemoveTag = (tag: string) => {
    for (const id of selected) {
      const c = cases.find((x) => x.id === id);
      if (!c || !c.tags.es.includes(tag)) continue;
      const nextEs = c.tags.es.filter((t) => t !== tag);
      const nextTags =
        c.tags.en && c.tags.en.length > 0 ? { es: nextEs, en: c.tags.en } : { es: nextEs };
      void onPatch(id, { tags: nextTags });
    }
  };

  // Keyboard navigation. j/k/↓/↑ move the active row cursor.
  // x toggles selection of the active row. Enter opens the full
  // modal. Suspended while focus is in any input/textarea/select.
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
      if (!tableRef.current?.isConnected) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveRow((prev) => Math.min(paged.length - 1, prev < 0 ? 0 : prev + 1));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveRow((prev) => (prev <= 0 ? 0 : prev - 1));
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
    // `toggleOne` is included now that it's wrapped in `useCallback`
    // (Block D — perf). Identity is stable across renders so the
    // listener doesn't re-subscribe on every keystroke.
  }, [paged, activeRow, onOpenEdit, toggleOne]);

  // Scroll the active row into view as it changes via keyboard.
  useEffect(() => {
    if (activeRow < 0 || !tableRef.current) return;
    const rows = tableRef.current.querySelectorAll<HTMLTableRowElement>("tbody tr.bulk-edit-row");
    rows[activeRow]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeRow]);

  return (
    <div className="bulk-edit">
      <BulkEditFilters
        filterSection={filterSection}
        setFilterSection={setFilterSection}
        filterCat={filterCat}
        setFilterCat={setFilterCat}
        query={query}
        setQuery={setQuery}
        pageSize={pageSize}
        setPageSize={setPageSize}
        pageStart={pageStart}
        pageEnd={pageStart + pageSize}
        total={sorted.length}
        categories={categories}
        pageSizes={PAGE_SIZES}
      />

      <div className="bulk-edit-scroll">
        <table className="bulk-edit-table" ref={tableRef}>
          <thead>
            <tr>
              <th className="bulk-edit-th-check">
                <input
                  type="checkbox"
                  aria-label={t("bulk.selectAll.aria")}
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
              </th>
              <th className="bulk-edit-th-thumb"></th>
              <BulkEditSortHeader
                field="title"
                active={sortField === "title"}
                dir={sortDir}
                onClick={cycleSort}
              >
                {t("bulk.col.title")}
              </BulkEditSortHeader>
              <BulkEditSortHeader
                field="description"
                active={sortField === "description"}
                dir={sortDir}
                onClick={cycleSort}
              >
                {t("bulk.col.description")}
              </BulkEditSortHeader>
              <BulkEditSortHeader
                field="category"
                active={sortField === "category"}
                dir={sortDir}
                onClick={cycleSort}
                className="bulk-edit-th-cat"
              >
                {t("bulk.col.category")}
              </BulkEditSortHeader>
              <th className="bulk-edit-th-tags">{t("bulk.col.tags")}</th>
              <BulkEditSortHeader
                field="reviewed"
                active={sortField === "reviewed"}
                dir={sortDir}
                onClick={cycleSort}
                className="bulk-edit-th-reviewed"
                title={t("bulk.col.reviewed.title")}
              >
                ✓
              </BulkEditSortHeader>
              <th className="bulk-edit-th-actions"></th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c, i) => (
              <BulkEditRow
                key={c.id}
                caso={c}
                categories={categories}
                checked={selected.has(c.id)}
                isActive={i === activeRow}
                // Pass the stable id-receiving callback directly —
                // wrapping it in an arrow `() => toggleOne(c.id)`
                // would defeat the row's `React.memo` because the
                // arrow's identity changes every parent render.
                onCheck={toggleOne}
                onPatch={onPatch}
                onOpenEdit={onOpenEdit}
                onDelete={onDelete}
                onAIRewrite={setAiTarget}
              />
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={8} className="bulk-edit-empty">
                  {hasActiveFilters ? (
                    <>
                      <span>{t("bulk.empty.filtered")}</span>
                      <button
                        type="button"
                        className="bulk-edit-empty-clear"
                        onClick={() => {
                          setFilterSection("");
                          setFilterCat("");
                          setQuery("");
                        }}
                      >
                        {t("bulk.empty.clearFilters")}
                      </button>
                    </>
                  ) : (
                    t("bulk.empty.catalog")
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <BulkEditPagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        />
      )}

      {someSelected && (
        <BulkEditActionBar
          selectedCount={selected.size}
          categories={categories}
          onApplySection={(s) => void applyBulkSection(s)}
          onApplyCategory={(c) => void applyBulkCategory(c)}
          onApplyReviewed={(r) => void applyBulkReviewed(r)}
          onDelete={() => void applyBulkDelete()}
          onClear={clearSelection}
          tagFrequencies={tagFrequencies}
          onApplyAddTag={applyBulkAddTag}
          onApplyRemoveTag={applyBulkRemoveTag}
          onAIRewriteBulk={() => setAiBulkOpen(true)}
        />
      )}
      {/* Per-row AI rewrite modal. Mounted conditionally — the
          internal <dialog> auto-opens via useLayoutEffect. Closing
          (×, cancel, or successful apply) flips `aiTarget` to null
          which unmounts the modal. */}
      {aiTarget && (
        <AIRewriteModal caso={aiTarget} onApplyPatch={onPatch} onClose={() => setAiTarget(null)} />
      )}
      {/* Bulk AI rewrite modal. Reads `selected` set at modal open
          time and freezes that list as the batch input. Subsequent
          changes to `selected` while the batch runs don't affect
          the in-flight casework. */}
      {aiBulkOpen && (
        <AIBulkRewriteModal
          cases={filtered.filter((c) => selected.has(c.id))}
          onApplyPatch={onPatch}
          onClose={() => setAiBulkOpen(false)}
        />
      )}
    </div>
  );
}
