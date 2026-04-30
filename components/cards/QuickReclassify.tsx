"use client";

import { useEffect, useRef, useState } from "react";
import { SECTIONS } from "@/lib/data";
import type { CaseRecord, Category, SectionId } from "@/lib/types";

interface Props {
  caso: CaseRecord;
  /** Categories list (built-in + custom). Caller should pass the
   *  merged set so the menu reflects the admin's current taxonomy. */
  categories: Category[];
  /** Apply a partial override. Same signature the classifier uses;
   *  the helper here only ever sends `section` or `category` (with
   *  the `Sin clasificar` tag stripped, matching drag-drop behavior). */
  onPatch: (id: string, patch: Partial<CaseRecord>) => void;
}

/**
 * Hover-revealed quick-reclassify control. Renders a small chip on
 * the thumbnail; click opens an inline popover with two clickable
 * lists (sections, categories). Picking a value sends a single
 * `onPatch` call and closes the popover.
 *
 * Why not a `<select>`: native selects are ugly inside a card chip
 * and don't render two distinct option groups well. The popover
 * gives us section + category in a single readable surface, with
 * the current value visually checked.
 *
 * Click events on the chip / popover stop propagation so the parent
 * card's onOpen doesn't fire and pop the modal.
 */
export default function QuickReclassify({ caso, categories, onPatch }: Props) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click. We attach the listener only while open
  // so we're not paying for it across the whole grid.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const node = popoverRef.current;
      if (node && !node.contains(e.target as Node)) setOpen(false);
    };
    // Defer the listener attach to the next tick so the click that
    // opened the popover doesn't immediately close it.
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  // Close on Escape too — keyboard users.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const applySection = (id: SectionId) => {
    // Match the classifier drag-drop semantics: any classification
    // decision strips the import-time `Sin clasificar` tag. Otherwise
    // the case stays under the unclassified queue even after the
    // admin made a deliberate call.
    const tags = caso.tags.filter((t) => t !== "Sin clasificar");
    onPatch(caso.id, { section: id, tags });
    setOpen(false);
  };

  const applyCategory = (id: string) => {
    const tags = caso.tags.filter((t) => t !== "Sin clasificar");
    onPatch(caso.id, { category: id, tags });
    setOpen(false);
  };

  return (
    <div
      className="quick-reclassify"
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="quick-reclassify-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Cambiar sección o categoría"
        aria-expanded={open}
        title="Reclasificar (sección · categoría)"
      >
        ⇄
      </button>

      {open && (
        <div className="quick-reclassify-popover" role="menu">
          <div className="quick-reclassify-group">
            <div className="quick-reclassify-label">Sección</div>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitemradio"
                aria-checked={caso.section === s.id}
                className={`quick-reclassify-item${caso.section === s.id ? " is-active" : ""}`}
                onClick={() => applySection(s.id)}
              >
                <span className="quick-reclassify-check" aria-hidden="true">
                  {caso.section === s.id ? "✓" : ""}
                </span>
                {s.label}
              </button>
            ))}
          </div>
          <div className="quick-reclassify-group">
            <div className="quick-reclassify-label">Categoría</div>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="menuitemradio"
                aria-checked={caso.category === c.id}
                className={`quick-reclassify-item${caso.category === c.id ? " is-active" : ""}`}
                onClick={() => applyCategory(c.id)}
              >
                <span className="quick-reclassify-check" aria-hidden="true">
                  {caso.category === c.id ? "✓" : ""}
                </span>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
