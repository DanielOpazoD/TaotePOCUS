"use client";

// Modal-scoped keyboard shortcuts.
//
//   - Escape  → onClose
//   - F / f   → onFav   (mirrors the "F" hint next to the favorite button)
//   - S / s   → onShare (mirrors the "S" hint next to the share button)
//   - P / p   → onPresent (mirrors the "P" hint next to the present button)
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

export function useModalShortcuts({ onClose, onFav, onShare, onPresent }: ModalShortcuts) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isTextInputTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
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
  }, [onClose, onFav, onShare, onPresent]);
}
