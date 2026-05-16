"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Direction the sheet closes in:
 *   - `"down"`  — bottom-sheet style (modals). Drag down → close.
 *   - `"left"`  — slide-out drawer that lives on the left edge (the
 *     mobile nav drawer). Drag left → close.
 *
 * Default is `"down"` so existing callers (`<CaseModal>`) don't have
 * to thread the new prop.
 */
export type SwipeCloseDirection = "down" | "left";

interface Options {
  /** Direction the sheet closes in. See {@link SwipeCloseDirection}. */
  direction?: SwipeCloseDirection;
  /** Pixels of drag in the close direction required to commit the
   *  dismissal at rest. Defaults to 80 — enough to reject incidental
   *  taps + short scrolls, low enough to feel responsive. A *fast*
   *  flick can close at lower distance (see velocity below). */
  threshold?: number;
  /**
   * Velocity threshold (pixels per millisecond, in the close
   * direction) above which the release counts as a "flick" and
   * closes regardless of total distance. Real-world iOS / Material
   * sheets use ~0.5 px/ms as the dividing line between a deliberate
   * drag and a flick — anything faster is clearly intent, no need
   * to demand 80 px of travel.
   */
  flickVelocity?: number;
  /** Called when the user releases past the threshold OR flicks. */
  onClose: () => void;
  /** Disable on devices that don't have a touch interface. */
  enabled?: boolean;
}

/**
 * Touch swipe-to-dismiss for sheet / drawer surfaces on mobile. The
 * hook returns a ref + a displacement (`offset`, in CSS pixels) that
 * the caller applies to the appropriate axis transform. Two close
 * gestures are supported by `direction`:
 *
 *   - `"down"`: classic bottom-sheet drag (modals). Apply offset as
 *     `translateY(${offset}px)`.
 *   - `"left"`: edge-drawer drag. Apply as `translateX(-${offset}px)`.
 *
 * Dismissal fires on EITHER condition:
 *   - The user released past `threshold` of displacement, OR
 *   - The release velocity exceeded `flickVelocity` regardless of
 *     distance (fast flick = clear intent).
 *
 * Pointer events are used (instead of legacy touch events) so the
 * gesture also works with stylus and mouse-drag in dev. Skips
 * entirely on viewports wider than 880 px — desktops have a close
 * button and a swipe would interfere with text selection.
 */
export function useSwipeToClose<T extends HTMLElement>({
  direction = "down",
  threshold = 80,
  flickVelocity = 0.5,
  onClose,
  enabled = true,
}: Options) {
  const ref = useRef<T | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startPos = useRef(0);
  const startTime = useRef(0);
  const lastPos = useRef(0);
  const lastTime = useRef(0);
  const tracking = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const axisOf = (e: PointerEvent) => (direction === "down" ? e.clientY : e.clientX);

    // For "down" the close direction is +Y; for "left" the close
    // direction is -X. We always return a non-negative magnitude so
    // the caller can plug it straight into a transform without
    // branching on the sign.
    const closeMagnitude = (current: number, start: number) =>
      direction === "down" ? Math.max(0, current - start) : Math.max(0, start - current);

    const onPointerDown = (e: PointerEvent) => {
      // Only capture primary pointer + skip when starting on an
      // interactive control (buttons, links) so taps don't get hijacked.
      if (!e.isPrimary) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, select, textarea, [role='button']")) return;
      // Mobile only — desktop has a close button.
      if (window.matchMedia("(min-width: 880px)").matches) return;
      tracking.current = true;
      const pos = axisOf(e);
      const now = e.timeStamp;
      startPos.current = pos;
      startTime.current = now;
      lastPos.current = pos;
      lastTime.current = now;
      setDragging(true);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!tracking.current) return;
      const pos = axisOf(e);
      lastPos.current = pos;
      lastTime.current = e.timeStamp;
      setOffset(closeMagnitude(pos, startPos.current));
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!tracking.current) return;
      tracking.current = false;
      setDragging(false);
      const totalDistance = closeMagnitude(lastPos.current, startPos.current);
      // Velocity from the LAST recorded move (not the total mean) so
      // a slow drag followed by a quick flick at the end still
      // counts as a flick. Tiny epsilon avoids divide-by-zero when
      // pointer-up fires in the same frame as the last move.
      const dt = Math.max(
        1,
        e.timeStamp - lastTime.current + (lastTime.current - startTime.current),
      );
      const velocity = totalDistance / dt;
      const flick = velocity >= flickVelocity && totalDistance > 10;
      if (totalDistance > threshold || flick) {
        onClose();
      } else {
        setOffset(0);
      }
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [direction, enabled, threshold, flickVelocity, onClose]);

  return { ref, offset, dragging };
}
