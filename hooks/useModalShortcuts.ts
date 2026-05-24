"use client";

// Modal-scoped keyboard shortcuts.
//
//   - Escape    → onClose
//   - F / f     → onFav   (mirrors the "F" hint next to the favorite button)
//   - S / s     → onShare (mirrors the "S" hint next to the share button)
//   - P / p     → onPresent (mirrors the "P" hint next to the present button)
//   - ArrowLeft → onPrev (when provided + a prev case exists)
//   - ArrowRight→ onNext (when provided + a next case exists)
//
// The hook deliberately ignores keystrokes that originate from a
// text-input target (input / textarea / select / contenteditable) so
// the user can compose text inside the modal without the F-key
// flipping the favorite. It also ignores chorded modifiers
// (Meta/Ctrl/Alt) so platform shortcuts (Cmd-W, Ctrl-F, etc.) reach
// the browser without us swallowing them.
//
// Lifted out of `CaseModal.tsx` in May-2026: the modal had ~40 lines
// of inline keydown handler that were hard to test in isolation. With
// the hook, callers can mount in any dialog (case modal, presentation
// mode, future surfaces) and get the same behavior.

import { useEffect } from "react";

export interface ModalShortcuts {
  onClose: () => void;
  onFav?: () => void;
  onShare?: () => void;
  onPresent?: () => void;
  /** Step to the previous case in the navigable set. When undefined
   *  OR `hasPrev` is false the ArrowLeft key falls through to the
   *  browser (page scroll, etc.). */
  onPrev?: () => void;
  /** Step to the next case. Same falls-through semantics as
   *  `onPrev`. */
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

export function useModalShortcuts({
  onClose,
  onFav,
  onShare,
  onPresent,
  onPrev,
  onNext,
  hasPrev = true,
  hasNext = true,
}: ModalShortcuts) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isTextInputTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      // Arrow keys: step through the navigable set. Falls through
      // when the handler isn't provided OR we're at the boundary
      // (no prev / no next) — so a user at the end of the filtered
      // pool can still use the arrow key for native page behavior.
      if (e.key === "ArrowLeft" && onPrev && hasPrev) {
        e.preventDefault();
        onPrev();
        return;
      }
      if (e.key === "ArrowRight" && onNext && hasNext) {
        e.preventDefault();
        onNext();
        return;
      }
      if (onFav && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        onFav();
        return;
      }
      if (onShare && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        onShare();
        return;
      }
      if (onPresent && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        onPresent();
        return;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onFav, onShare, onPresent, onPrev, onNext, hasPrev, hasNext]);
}
