"use client";

// Drag-controller for the classifier board.
//
// Owns the drag state machine (which case is being dragged, which
// drop-zone is currently being hovered) and the `handleDrop`
// reducer that converts a drop event into a `Partial<CaseRecord>`
// patch. Returns the drop-zone props the board wires onto each
// `<DropZone>`.
//
// Pulled out of the monolithic `ClassifierBoard` so the drag
// pipeline is testable in isolation and the parent stays focused
// on layout + selection. The `<DropZone>` element ships from this
// module too, since it's the only consumer of the hover-target
// callbacks the hook exposes.

import { useState } from "react";
import { IMPORT_MARKER_TAG } from "@/lib/data";
import type { CaseRecord, SectionId } from "@/lib/types";

interface UseDragArgs {
  cases: CaseRecord[];
  /** Apply a partial override to a case. Same callback the board
   *  threads through to its row-level affordances. */
  onPatch: (id: string, patch: Partial<CaseRecord>) => void;
}

export interface ClassifierDragApi {
  /** Id of the case currently being dragged, or null. */
  draggedId: string | null;
  /** Encoded id of the drop-zone the cursor is over (`s-<id>`
   *  for a section, `c-<id>` for a category), or null. */
  hoverTarget: string | null;
  /** Wire to a draggable card's `onDragStart`. The `id` argument
   *  is the case id; the callback also installs the no-op drag
   *  ghost so the floating hint-pill is the only visible cue. */
  startDrag: (id: string, e: React.DragEvent) => void;
  /** Wire to a draggable card's `onDragEnd`. Resets the drag state
   *  whether or not a drop landed. */
  endDrag: () => void;
  /** Resolve the drop. Strips the import-time `Sin clasificar`
   *  tag in both branches (any decision counts as classification). */
  handleDrop: (kind: "section" | "category", id: string) => void;
  /** Wire onto a drop zone — manages enter/leave reactivity. */
  onZoneEnter: (encodedId: string) => void;
  /** Wire onto a drop zone leave handler. */
  onZoneLeave: () => void;
}

/**
 * Suppress the browser's default drag ghost. We render a separate
 * floating hint pill at the bottom of the viewport so the cursor
 * area (which lands on drop-zone labels) stays unobstructed.
 *
 * Implementation: append a 1×1 offscreen div, snapshot it as the
 * drag image, then drop it on the next frame. Browsers cache the
 * snapshot at dragstart, so removing the element afterwards is
 * safe.
 */
function suppressDragGhost(e: React.DragEvent) {
  if (typeof document === "undefined") return;
  const ghost = document.createElement("div");
  ghost.style.cssText = "position:fixed;top:-1000px;left:-1000px;width:1px;height:1px;";
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 0, 0);
  // Defer removal until after the snapshot is taken.
  requestAnimationFrame(() => ghost.remove());
}

export function useClassifierDrag({ cases, onPatch }: UseDragArgs): ClassifierDragApi {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);

  const startDrag = (id: string, e: React.DragEvent) => {
    setDraggedId(id);
    // Some browsers require non-empty data — set a no-op string.
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    // The default ghost (a snapshot of the card) is large enough to
    // cover the drop-zone labels, hiding which target the cursor is
    // over. Suppress it; the floating hint pill renders the drag
    // affordance instead.
    suppressDragGhost(e);
  };

  const endDrag = () => {
    setDraggedId(null);
    setHoverTarget(null);
  };

  const handleDrop = (kind: "section" | "category", id: string) => {
    if (!draggedId) return;
    // Either decision — section OR category — counts as "the admin
    // has classified this case", so we strip the import-time marker
    // (`IMPORT_MARKER_TAG`) in both branches. Otherwise dropping on
    // a section silently updated `section` but left the card visible
    // under the unclassified filter, which felt like the drop had
    // failed (issue surfaced 2026-04).
    //
    // The marker is filtered from BOTH language slots — keeps the
    // ES and EN tag lists consistent in case the admin had already
    // translated the tag set before classifying.
    const dragged = cases.find((c) => c.id === draggedId);
    const cleanedEs = (dragged?.tags.es ?? []).filter((t) => t !== IMPORT_MARKER_TAG);
    const cleanedEn = dragged?.tags.en?.filter((t) => t !== IMPORT_MARKER_TAG);
    const tags: CaseRecord["tags"] =
      cleanedEn && cleanedEn.length > 0 ? { es: cleanedEs, en: cleanedEn } : { es: cleanedEs };
    if (kind === "section") {
      onPatch(draggedId, { section: id as SectionId, tags });
    } else {
      onPatch(draggedId, { category: id, tags });
    }
    setDraggedId(null);
    setHoverTarget(null);
  };

  return {
    draggedId,
    hoverTarget,
    startDrag,
    endDrag,
    handleDrop,
    onZoneEnter: setHoverTarget,
    onZoneLeave: () => setHoverTarget(null),
  };
}

interface DropZoneProps {
  id: string;
  label: string;
  kind: "section" | "category";
  isHover: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}

/**
 * Drop-zone pill rendered at the top of the classifier. The board
 * builds one row of these for sections and another row for
 * categories; the hover state is driven by the `useClassifierDrag`
 * api above.
 */
export function DropZone({
  id,
  label,
  kind,
  isHover,
  onDragEnter,
  onDragLeave,
  onDrop,
}: DropZoneProps) {
  return (
    <button
      type="button"
      className={`classifier-target classifier-target--${kind}${isHover ? " is-hover" : ""}`}
      data-id={id}
      onDragOver={(e) => {
        // Required to mark the element as a valid drop target.
        // Without preventDefault here, onDrop will never fire.
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
