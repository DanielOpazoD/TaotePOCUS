"use client";

import { useEffect, useRef, useState } from "react";

interface Options {
  /** Pixels of vertical drag required to commit the dismissal. */
  threshold?: number;
  /** Called when the user releases past the threshold. */
  onClose: () => void;
  /** Disable on devices that don't have a touch interface. */
  enabled?: boolean;
}

/**
 * Touch swipe-to-dismiss for sheet-style modals on mobile. The hook
 * returns a ref + a transform offset (`translateY` in CSS pixels) that
 * the caller applies inline so the sheet follows the finger. On release:
 * if the drag exceeds `threshold`, fires `onClose`; otherwise the sheet
 * snaps back to 0.
 *
 * Pointer events are used (instead of legacy touch events) so the
 * gesture also works with stylus and mouse-drag in dev. Skips entirely
 * on viewports wider than 880 px — desktops have a close button.
 */
export function useSwipeToClose<T extends HTMLElement>({
  threshold = 80,
  onClose,
  enabled = true,
}: Options) {
  const ref = useRef<T | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const tracking = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      // Only capture primary pointer + skip when starting on an
      // interactive control (buttons, links) so taps don't get hijacked.
      if (!e.isPrimary) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, select, textarea, [role='button']")) return;
      // Mobile only — desktop has a close button.
      if (window.matchMedia("(min-width: 880px)").matches) return;
      tracking.current = true;
      startY.current = e.clientY;
      setDragging(true);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!tracking.current) return;
      const dy = e.clientY - startY.current;
      // Resist upward drag — sheets only dismiss downward.
      setOffset(Math.max(0, dy));
    };
    const onPointerUp = () => {
      if (!tracking.current) return;
      tracking.current = false;
      setDragging(false);
      if (offset > threshold) {
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
  }, [enabled, threshold, onClose, offset]);

  return { ref, offset, dragging };
}
