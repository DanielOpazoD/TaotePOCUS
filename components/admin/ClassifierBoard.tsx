"use client";

import { useEffect, useMemo, useState } from "react";
import { CineLoop } from "../cine";
import AdminThumbMenu from "../cards/AdminThumbMenu";
import { CATEGORIES, IMPORT_MARKER_TAG, SECTIONS } from "@/lib/data";
import { getDescription } from "@/lib/case-description";
import { categoryLabelEs, sectionLabel } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import type { CaseRecord, Category } from "@/lib/types";
import { DropZone, useClassifierDrag } from "./classifier/useClassifierDrag";
import { ClassifierDragHint } from "./classifier/ClassifierDragHint";
import { BulkActionBar } from "./classifier/BulkActionBar";

interface Props {
  cases: CaseRecord[];
  /** Categories list (built-in + admin-managed custom). Defaults to
   *  the static `CATEGORIES` so older callers / tests still render. */
  categories?: Category[];
  /** Apply a partial override to a case (section / category / reviewed). */
  onPatch: (id: string, patch: Partial<CaseRecord>) => void;
  /** Open the full edit form for fine-grained edits beyond drag-classify. */
  onOpenEdit: (caso: CaseRecord) => void;
  /** Soft-delete the case. Triggers the parent's confirm dialog —
   *  the admin can restore from the trash section in the admin panel. */
  onDelete?: (caso: CaseRecord) => void;
  /** Permanent-delete the case (irreversible). Triggers a stronger
   *  confirm dialog at the App level. Distinct from `onDelete`:
   *  this removes metadata + the blob, the case never reappears. */
  onPurge?: (caso: CaseRecord) => void;
  /** Apply the same patch to many cases at once. Skips the
   *  per-card confirm; the parent shows a single undo toast that
   *  reverses every change as a unit. Optional — when absent, the
   *  multi-select bar hides reclassify / review affordances. */
  onBulkPatch?: (ids: string[], patch: Partial<CaseRecord>) => void;
  /** Soft-delete every selected case at once. Skips the per-card
   *  confirm dialog (the bulk gesture itself + the undo toast are
   *  the safety net). Optional — when absent, "Mover a papelera"
   *  hides from the bulk bar. */
  onBulkSoftDelete?: (ids: string[]) => void;
}

type Filter = "all" | "unclassified" | "unreviewed";
const ANY = "__any__";

/**
 * Bulk-classification board. A grid of thumbnails the admin can:
 *
 *   - Drag onto a section pill (top row) → reassigns `section`
 *   - Drag onto a category pill (top row) → reassigns `category`
 *   - Click the ✓ badge → toggles `reviewed`
 *   - Click the thumbnail → opens the full edit form
 *
 * Filters at the top narrow the queue to the cases that still need
 * work (`IMPORT_MARKER_TAG` queue — the cases the import script
 * left for human classification; "unreviewed" — anything without
 * the editorial-review checkmark).
 *
 * The panel is independent of the public catalog routes so the
 * admin can plough through 326 cases without leaving the page.
 *
 * Decomposed in May-2026 — the drag pipeline + DropZone moved into
 * `./classifier/useClassifierDrag.ts`, the floating hint pill into
 * `./classifier/ClassifierDragHint.tsx`. The board itself stays
 * focused on layout, filters, and selection.
 */
export default function ClassifierBoard({
  cases,
  categories = CATEGORIES,
  onPatch,
  onOpenEdit,
  onDelete,
  onPurge,
  onBulkPatch,
  onBulkSoftDelete,
}: Props) {
  const [filter, setFilter] = useState<Filter>("unclassified");
  const [searchQuery, setSearchQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState<string>(ANY);
  const [categoryFilter, setCategoryFilter] = useState<string>(ANY);
  // Multi-select state. The classifier shows ~330 cards; bulk
  // reclassify is the actual workflow when the import lands. We
  // track selected ids in a Set; the active row index lets
  // shift+click extend a range from the last toggled card.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [lastToggledId, setLastToggledId] = useState<string | null>(null);
  const { lang, t } = useLanguage();

  // Drag pipeline lives in its own hook so the state machine and
  // the DropZone wiring don't fight for space inside the board.
  const drag = useClassifierDrag({ cases, onPatch });

  // Compose all four filters with AND. The classification-state pill
  // (unclassified / unreviewed / all) is the coarsest cut; the
  // search / section / category filters narrow further. We keep this
  // pipeline pure inside the memo so each change re-derives without
  // touching component state — easier to reason about than effect-based
  // synchronization.
  const visible = useMemo(() => {
    let pool: CaseRecord[];
    switch (filter) {
      case "unclassified":
        // The import marker (`IMPORT_MARKER_TAG`) is data, not UI
        // copy — it lives in the ES slot because the importer
        // always writes there. The pill label that says "Sin
        // clasificar" / "Unclassified" is a separate concern routed
        // through the i18n dictionary.
        pool = cases.filter((c) => c.tags.es.includes(IMPORT_MARKER_TAG));
        break;
      case "unreviewed":
        pool = cases.filter((c) => !c.reviewed);
        break;
      case "all":
      default:
        pool = cases;
    }
    if (sectionFilter !== ANY) pool = pool.filter((c) => c.section === sectionFilter);
    if (categoryFilter !== ANY) pool = pool.filter((c) => c.category === categoryFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      pool = pool.filter((c) => {
        // Search across ES + EN content + tags + author so the admin
        // can find a partially-translated case by typing in either
        // language. `getDescription` returns the ES baseline; we
        // append the EN slot when present.
        const haystack = [
          c.title.es,
          c.title.en ?? "",
          getDescription(c),
          c.description.en ?? "",
          c.author,
          ...c.tags.es,
          ...(c.tags.en ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    return pool;
  }, [cases, filter, sectionFilter, categoryFilter, searchQuery]);

  const counts = useMemo(
    () => ({
      all: cases.length,
      unclassified: cases.filter((c) => c.tags.es.includes(IMPORT_MARKER_TAG)).length,
      unreviewed: cases.filter((c) => !c.reviewed).length,
    }),
    [cases],
  );

  // Whether the user has narrowed the queue with any of the auxiliary
  // filters (search / section / category). Used to show a "Limpiar
  // filtros" affordance — without it the empty-state for an over-
  // narrowed search looks like a bug.
  const hasAuxFilter = searchQuery.trim() !== "" || sectionFilter !== ANY || categoryFilter !== ANY;
  const clearAuxFilters = () => {
    setSearchQuery("");
    setSectionFilter(ANY);
    setCategoryFilter(ANY);
  };

  // ─── Multi-select helpers ──────────────────────────────────────
  // `toggleSelected` is the single seam — checkbox click and
  // ⌘/Ctrl+click on the card both go through it. Shift+click
  // extends a range from the last toggled id over the current
  // visible queue (the in-DOM order, which matches the user's
  // mental model after filters and sorts apply).
  const clearSelection = () => {
    setSelected(new Set());
    setLastToggledId(null);
  };
  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastToggledId(id);
  };
  const extendSelectionTo = (id: string) => {
    if (!lastToggledId || lastToggledId === id) {
      toggleSelected(id);
      return;
    }
    const startIdx = visible.findIndex((c) => c.id === lastToggledId);
    const endIdx = visible.findIndex((c) => c.id === id);
    if (startIdx === -1 || endIdx === -1) {
      toggleSelected(id);
      return;
    }
    const [from, to] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
    setSelected((prev) => {
      const next = new Set(prev);
      for (let i = from; i <= to; i++) {
        const c = visible[i];
        if (c) next.add(c.id);
      }
      return next;
    });
    setLastToggledId(id);
  };

  // Esc clears selection. Bound at the document level rather than
  // on the grid so the shortcut works regardless of where focus
  // lives — typical admin flow is "click a checkbox, ⇧-click another,
  // Esc to bail" without ever giving the grid focus.
  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size]);

  // Drop the selection whenever the visible queue's identity set
  // changes substantially (filter/search change). Otherwise a
  // selection made under the unclassified filter would survive a
  // switch to "all" and the bulk bar would report counts the user
  // can no longer see.
  useEffect(() => {
    if (selected.size === 0) return;
    const visibleIds = new Set(visible.map((c) => c.id));
    const stillVisible = Array.from(selected).filter((id) => visibleIds.has(id));
    if (stillVisible.length !== selected.size) {
      setSelected(new Set(stillVisible));
      if (lastToggledId && !visibleIds.has(lastToggledId)) setLastToggledId(null);
    }
    // The selection set is the dependency we care about; `visible`
    // identity changing is the trigger for filtering it.
  }, [visible, selected, lastToggledId]);

  return (
    <div className="classifier">
      <div className="classifier-head">
        <h2>{t("classifier.title")}</h2>
        <p className="classifier-sub">{t("classifier.intro")}</p>
        <div className="classifier-filters" role="tablist">
          <button
            role="tab"
            aria-selected={filter === "unclassified"}
            className={`filter-pill${filter === "unclassified" ? " is-active" : ""}`}
            onClick={() => setFilter("unclassified")}
          >
            {t("classifier.tab.unclassified")}{" "}
            <span className="filter-pill-count">{counts.unclassified}</span>
          </button>
          <button
            role="tab"
            aria-selected={filter === "unreviewed"}
            className={`filter-pill${filter === "unreviewed" ? " is-active" : ""}`}
            onClick={() => setFilter("unreviewed")}
          >
            {t("classifier.tab.unreviewed")}{" "}
            <span className="filter-pill-count">{counts.unreviewed}</span>
          </button>
          <button
            role="tab"
            aria-selected={filter === "all"}
            className={`filter-pill${filter === "all" ? " is-active" : ""}`}
            onClick={() => setFilter("all")}
          >
            {t("classifier.tab.all")} <span className="filter-pill-count">{counts.all}</span>
          </button>
        </div>
        {/* Auxiliary filters — search + section + category. AND-compose
            with the queue-state pill above. The "Limpiar" button only
            shows when at least one is non-default so the affordance
            doesn't add chrome when nothing's narrowed. */}
        <div className="classifier-aux-filters">
          <input
            type="search"
            className="classifier-aux-input"
            placeholder={t("classifier.search.placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t("classifier.search.aria")}
          />
          <select
            className="classifier-aux-input"
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            aria-label={t("classifier.filter.section.aria")}
          >
            <option value={ANY}>{t("classifier.filter.section.any")}</option>
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {sectionLabel(s.id, lang)}
              </option>
            ))}
          </select>
          <select
            className="classifier-aux-input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label={t("classifier.filter.category.aria")}
          >
            <option value={ANY}>{t("classifier.filter.category.any")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabelEs(c)}
              </option>
            ))}
          </select>
          {hasAuxFilter && (
            <button
              type="button"
              className="classifier-aux-clear"
              onClick={clearAuxFilters}
              aria-label={t("classifier.filter.clear.aria")}
            >
              {t("classifier.filter.clear")}
            </button>
          )}
          <span className="classifier-aux-result">
            {t(visible.length === 1 ? "classifier.results.one" : "classifier.results.many", {
              count: visible.length,
            })}
          </span>
        </div>
      </div>

      <div className="classifier-targets">
        <div className="classifier-target-group" aria-label={t("classifier.targets.section.aria")}>
          <span className="classifier-target-label">{t("classifier.targets.section")}</span>
          {SECTIONS.map((s) => (
            <DropZone
              key={s.id}
              id={s.id}
              label={s.label}
              kind="section"
              isHover={drag.hoverTarget === `s-${s.id}`}
              onDragEnter={() => drag.onZoneEnter(`s-${s.id}`)}
              onDragLeave={drag.onZoneLeave}
              onDrop={() => drag.handleDrop("section", s.id)}
            />
          ))}
        </div>
        <div className="classifier-target-group" aria-label={t("classifier.targets.category.aria")}>
          <span className="classifier-target-label">{t("classifier.targets.category")}</span>
          {categories.map((c) => (
            <DropZone
              key={c.id}
              id={c.id}
              label={categoryLabelEs(c)}
              kind="category"
              isHover={drag.hoverTarget === `c-${c.id}`}
              onDragEnter={() => drag.onZoneEnter(`c-${c.id}`)}
              onDragLeave={drag.onZoneLeave}
              onDrop={() => drag.handleDrop("category", c.id)}
            />
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty empty--illustrated">
          <h3>Nada por clasificar</h3>
          <p>Cuando este filtro tenga casos pendientes, aparecerán acá.</p>
        </div>
      ) : (
        <div className="classifier-grid">
          {visible.map((c) => (
            <article
              key={c.id}
              className={`classifier-card${drag.draggedId === c.id ? " is-dragging" : ""}${
                c.reviewed ? " is-reviewed" : ""
              }${selected.has(c.id) ? " is-selected" : ""}`}
              draggable
              onDragStart={(e) => drag.startDrag(c.id, e)}
              onDragEnd={drag.endDrag}
            >
              {/* Selection checkbox. Always rendered (low opacity at
                  rest, full opacity when selected or on card hover via
                  CSS). Clicking it toggles inclusion in the multi-
                  select set; ⇧ extends a range from the last toggled
                  card. The button stops propagation so the click
                  doesn't bubble to the card body. */}
              <button
                type="button"
                className="classifier-card-select"
                role="checkbox"
                aria-checked={selected.has(c.id)}
                aria-label={t("classifier.checkbox.aria", { title: c.title.es })}
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.shiftKey) extendSelectionTo(c.id);
                  else toggleSelected(c.id);
                }}
              >
                <span className="classifier-card-select-box" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="classifier-thumb"
                onClick={(e) => {
                  // ⌘/Ctrl-click anywhere on the thumb toggles
                  // selection instead of opening the editor — gives
                  // the admin a fast keyboard-augmented multi-select
                  // without having to chase the small corner checkbox.
                  if (e.metaKey || e.ctrlKey) {
                    e.preventDefault();
                    if (e.shiftKey) extendSelectionTo(c.id);
                    else toggleSelected(c.id);
                    return;
                  }
                  onOpenEdit(c);
                }}
                title="Click para editar · ⌘/Ctrl+click para seleccionar"
                aria-label={`Editar ${c.title}`}
              >
                <CineLoop
                  kind={c.loop}
                  aspect="1/1"
                  speed={0.6}
                  showChrome={false}
                  media={c.media}
                />
              </button>
              <div className="classifier-card-meta">
                {/* Admin queue surface shows the ES baseline — the
                    classifier is editorial work; the canonical title
                    is what gets reviewed and tagged here. EN
                    translation lives in the full CaseForm modal. */}
                <div className="classifier-card-title">{c.title.es}</div>
                <div className="classifier-card-tags">
                  <span>{c.section}</span>
                  <span className="dot" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    {(() => {
                      const cat = categories.find((x) => x.id === c.category);
                      return cat ? categoryLabelEs(cat) : c.category;
                    })()}
                  </span>
                </div>
              </div>
              {/* Reviewed checkmark stays inline — it's a one-click
                  toggle, not a destructive action, and lives in its
                  own corner of the card. The four other admin
                  affordances (reclasificar / foco / papelera / purge)
                  consolidated into the AdminThumbMenu below. */}
              <button
                type="button"
                className={`classifier-card-review${c.reviewed ? " is-on" : ""}`}
                onClick={() => onPatch(c.id, { reviewed: !c.reviewed })}
                title={c.reviewed ? "Quitar marca de revisado" : "Marcar como revisado"}
                aria-label="Marcar revisado"
                aria-pressed={Boolean(c.reviewed)}
              >
                ✓
              </button>
              <AdminThumbMenu
                caso={c}
                categories={categories}
                onPatch={onPatch}
                onDelete={onDelete ? () => onDelete(c) : undefined}
                onPurge={onPurge ? () => onPurge(c) : undefined}
              />
            </article>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          ids={Array.from(selected)}
          categories={categories}
          onClear={clearSelection}
          onBulkPatch={onBulkPatch}
          onBulkSoftDelete={onBulkSoftDelete}
          afterAction={clearSelection}
        />
      )}

      <ClassifierDragHint
        draggedId={drag.draggedId}
        hoverTarget={drag.hoverTarget}
        cases={cases}
        categories={categories}
      />
    </div>
  );
}

// `BulkActionBar` lives in `./classifier/BulkActionBar.tsx`.
// `useClassifierDrag` + `DropZone` live in `./classifier/useClassifierDrag.tsx`.
// `ClassifierDragHint` lives in `./classifier/ClassifierDragHint.tsx`.
