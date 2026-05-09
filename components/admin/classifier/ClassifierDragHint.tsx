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
import { categoryLabelEs, sectionLabel } from "@/lib/i18n";
import { useT, useLanguage } from "@/hooks/useLanguage";
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
  const t = useT();
  const { lang } = useLanguage();
  if (!draggedId) return null;

  // Compose the hint shown at the bottom of the viewport during
  // drag: title of the dragged case + label of the target the
  // cursor is over (when any).
  const dragged = cases.find((c) => c.id === draggedId);
  let landing: string | null = null;
  if (hoverTarget) {
    const [kind, ...rest] = hoverTarget.split("-");
    const id = rest.join("-");
    // Section labels follow the active UI language so the hint
    // shown to a Spanish admin matches the public nav. Custom
    // category labels stay on the ES baseline (the admin works in
    // ES regardless of the visitor language — same rule as the
    // rest of the classifier surface).
    if (kind === "s")
      landing = SECTIONS.find((s) => s.id === id) != null ? sectionLabel(id, lang) : null;
    else if (kind === "c") {
      const cat = categories.find((c) => c.id === id);
      landing = cat ? categoryLabelEs(cat) : null;
    }
  }

  return (
    <div className="classifier-drag-hint" role="status" aria-live="polite">
      <span className="classifier-drag-hint-label">{t("classifier.dragHint.label")}</span>
      {/* Drag hint on the admin classifier — show the ES title since
          this is editorial work. Falls back to a literal "caso" when
          the dragged case is unresolved (drag tracker race). */}
      <span className="classifier-drag-hint-title">
        {dragged?.title.es ?? t("classifier.dragHint.fallback")}
      </span>
      {landing ? (
        <>
          <span className="classifier-drag-hint-arrow" aria-hidden="true">
            →
          </span>
          <span className="classifier-drag-hint-target">{landing}</span>
        </>
      ) : (
        <span className="classifier-drag-hint-empty">{t("classifier.dragHint.empty")}</span>
      )}
    </div>
  );
}
