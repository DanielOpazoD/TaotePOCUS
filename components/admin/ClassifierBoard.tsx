"use client";

import { useMemo, useState } from "react";
import { CineLoop } from "../cine";
import { CATEGORIES, SECTIONS } from "@/lib/data";
import type { CaseRecord, Category, SectionId } from "@/lib/types";

interface Props {
  cases: CaseRecord[];
  /** Categories list (built-in + admin-managed custom). Defaults to
   *  the static `CATEGORIES` so older callers / tests still render. */
  categories?: Category[];
  /** Apply a partial override to a case (section / category / reviewed). */
  onPatch: (id: string, patch: Partial<CaseRecord>) => void;
  /** Open the full edit form for fine-grained edits beyond drag-classify. */
  onOpenEdit: (caso: CaseRecord) => void;
}

type Filter = "all" | "unclassified" | "unreviewed";

/**
 * Bulk-classification board. A grid of thumbnails the admin can:
 *
 *   - Drag onto a section pill (top row) → reassigns `section`
 *   - Drag onto a category pill (top row) → reassigns `category`
 *   - Click the ✓ badge → toggles `reviewed`
 *   - Click the thumbnail → opens the full edit form
 *
 * Filters at the top narrow the queue to the cases that still need
 * work ("Sin clasificar" — the import default-classified queue;
 * "Sin revisar" — anything without the editorial-review checkmark).
 *
 * The panel is independent of the public catalog routes so the
 * admin can plough through 326 cases without leaving the page.
 */
export default function ClassifierBoard({
  cases,
  categories = CATEGORIES,
  onPatch,
  onOpenEdit,
}: Props) {
  const [filter, setFilter] = useState<Filter>("unclassified");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);

  const visible = useMemo(() => {
    switch (filter) {
      case "unclassified":
        return cases.filter((c) => c.tags.includes("Sin clasificar"));
      case "unreviewed":
        return cases.filter((c) => !c.reviewed);
      case "all":
      default:
        return cases;
    }
  }, [cases, filter]);

  const counts = useMemo(
    () => ({
      all: cases.length,
      unclassified: cases.filter((c) => c.tags.includes("Sin clasificar")).length,
      unreviewed: cases.filter((c) => !c.reviewed).length,
    }),
    [cases],
  );

  const handleDrop = (kind: "section" | "category", id: string) => {
    if (!draggedId) return;
    if (kind === "section") {
      onPatch(draggedId, { section: id as SectionId });
    } else {
      // Reclassifying clears the "Sin clasificar" tag — once the admin
      // has manually picked a category, the import-time guess is moot.
      const dragged = cases.find((c) => c.id === draggedId);
      const tags = (dragged?.tags || []).filter((t) => t !== "Sin clasificar");
      onPatch(draggedId, { category: id, tags });
    }
    setDraggedId(null);
    setHoverTarget(null);
  };

  return (
    <div className="classifier">
      <div className="classifier-head">
        <h2>Clasificación global</h2>
        <p className="classifier-sub">
          Arrastra cualquier miniatura sobre una sección o categoría para reclasificar. Click sobre
          el ✓ marca el caso como revisado. Click sobre la miniatura abre el editor completo.
        </p>
        <div className="classifier-filters" role="tablist">
          <button
            role="tab"
            aria-selected={filter === "unclassified"}
            className={`filter-pill${filter === "unclassified" ? " is-active" : ""}`}
            onClick={() => setFilter("unclassified")}
          >
            Sin clasificar <span className="filter-pill-count">{counts.unclassified}</span>
          </button>
          <button
            role="tab"
            aria-selected={filter === "unreviewed"}
            className={`filter-pill${filter === "unreviewed" ? " is-active" : ""}`}
            onClick={() => setFilter("unreviewed")}
          >
            Sin revisar <span className="filter-pill-count">{counts.unreviewed}</span>
          </button>
          <button
            role="tab"
            aria-selected={filter === "all"}
            className={`filter-pill${filter === "all" ? " is-active" : ""}`}
            onClick={() => setFilter("all")}
          >
            Todos <span className="filter-pill-count">{counts.all}</span>
          </button>
        </div>
      </div>

      <div className="classifier-targets">
        <div className="classifier-target-group" aria-label="Secciones">
          <span className="classifier-target-label">Sección →</span>
          {SECTIONS.map((s) => (
            <DropZone
              key={s.id}
              id={s.id}
              label={s.label}
              kind="section"
              isHover={hoverTarget === `s-${s.id}`}
              onDragEnter={() => setHoverTarget(`s-${s.id}`)}
              onDragLeave={() => setHoverTarget(null)}
              onDrop={() => handleDrop("section", s.id)}
            />
          ))}
        </div>
        <div className="classifier-target-group" aria-label="Categorías">
          <span className="classifier-target-label">Categoría →</span>
          {categories.map((c) => (
            <DropZone
              key={c.id}
              id={c.id}
              label={c.label}
              kind="category"
              isHover={hoverTarget === `c-${c.id}`}
              onDragEnter={() => setHoverTarget(`c-${c.id}`)}
              onDragLeave={() => setHoverTarget(null)}
              onDrop={() => handleDrop("category", c.id)}
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
              className={`classifier-card${draggedId === c.id ? " is-dragging" : ""}${
                c.reviewed ? " is-reviewed" : ""
              }`}
              draggable
              onDragStart={(e) => {
                setDraggedId(c.id);
                // Some browsers require non-empty data — set a no-op string.
                e.dataTransfer.setData("text/plain", c.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setHoverTarget(null);
              }}
            >
              <button
                type="button"
                className="classifier-thumb"
                onClick={() => onOpenEdit(c)}
                title="Click para editar en detalle"
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
                <div className="classifier-card-title">{c.title}</div>
                <div className="classifier-card-tags">
                  <span>{c.section}</span>
                  <span className="dot" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    {categories.find((cat) => cat.id === c.category)?.label || c.category}
                  </span>
                </div>
              </div>
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
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function DropZone({
  id,
  label,
  kind,
  isHover,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  id: string;
  label: string;
  kind: "section" | "category";
  isHover: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}) {
  return (
    <button
      type="button"
      className={`classifier-target classifier-target--${kind}${isHover ? " is-hover" : ""}`}
      data-id={id}
      onDragOver={(e) => {
        // Required to mark the element as a valid drop target. Without
        // preventDefault here, onDrop will never fire.
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragEnter();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      {label}
    </button>
  );
}
