"use client";

// Floating drag-hint pill rendered at the bottom of the viewport
// while the admin is dragging a card across the classifier board.
//
// Stands in for the suppressed browser drag ghost: the hint shows
// (a) what's being dragged and (b) which target the cursor is
// currently over, in language that matches the surrounding UI
// ("Arrastrando ... → Sección Atlas"). Without this the suppressed
// ghost left a blank cursor with no feedback during drag.
//
// Pulled out of `ClassifierBoard` so the JSX of the board stays
// focused on layout and the drag overlay is a clean, single-purpose
// component.

import { SECTIONS } from "@/lib/data";
import type { CaseRecord, Category } from "@/lib/types";

interface Props {
  /** Id of the case currently being dragged, or null. The pill
   *  renders nothing when there's no active drag. */
  draggedId: string | null;
  /** Encoded id of the drop-zone the cursor is over
   *  (`s-<sectionId>` / `c-<categoryId>`), or null. */
  hoverTarget: string | null;
  /** Catalog cases — used to look up the dragged case's title. */
  cases: CaseRecord[];
  /** Categories list (built-in + custom) for the hover-target
   *  label resolution. */
  categories: Category[];
}

export function ClassifierDragHint({ draggedId, hoverTarget, cases, categories }: Props) {
  if (!draggedId) return null;

  // Compose the hint shown at the bottom of the viewport during
  // drag: title of the dragged case + label of the target the
  // cursor is over (when any).
  const dragged = cases.find((c) => c.id === draggedId);
  let landing: string | null = null;
  if (hoverTarget) {
    const [kind, ...rest] = hoverTarget.split("-");
    const id = rest.join("-");
    if (kind === "s") landing = SECTIONS.find((s) => s.id === id)?.label ?? null;
    else if (kind === "c") landing = categories.find((c) => c.id === id)?.label ?? null;
  }

  return (
    <div className="classifier-drag-hint" role="status" aria-live="polite">
      <span className="classifier-drag-hint-label">Arrastrando</span>
      {/* Drag hint on the admin classifier — show the ES title since
          this is editorial work. Falls back to a literal "caso" when
          the dragged case is unresolved (drag tracker race). */}
      <span className="classifier-drag-hint-title">{dragged?.title.es ?? "caso"}</span>
      {landing ? (
        <>
          <span className="classifier-drag-hint-arrow" aria-hidden="true">
            →
          </span>
          <span className="classifier-drag-hint-target">{landing}</span>
        </>
      ) : (
        <span className="classifier-drag-hint-empty">Suelta sobre una sección o categoría</span>
      )}
    </div>
  );
}
