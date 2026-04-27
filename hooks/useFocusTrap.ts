"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Traps Tab / Shift+Tab inside a container while `active`. Restores
 * focus to the previously-focused element on unmount.
 *
 * Implementation notes:
 * - Listens on the container itself (not `window`) so multiple traps
 *   can stack — the innermost one wins. Useful when a modal opens a
 *   confirm dialog over itself.
 * - The query for focusable elements runs on every Tab so dynamic
 *   content (a button that appears mid-flow) joins the trap correctly.
 * - When the trap closes we re-focus the previous element only if it
 *   still exists in the document — avoids stealing focus from a newly
 *   mounted second dialog.
 *
 * @typeParam T  The container element type. Pass it explicitly so the
 *               returned ref is typed (e.g. `HTMLDivElement`).
 * @param active Whether the trap is currently engaged. Pass `false`
 *               while the modal is closed.
 * @returns A ref to attach to the container element.
 *
 * @example
 * const ref = useFocusTrap<HTMLDivElement>(open);
 * return <div ref={ref} role="dialog" aria-modal>{children}</div>;
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the dialog if it isn't already there.
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );

    const initial = focusables();
    if (initial.length && !container.contains(document.activeElement)) {
      initial[0].focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (current === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("keydown", onKey);
      // Don't steal focus back if the user moved on to another dialog.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return ref;
}
