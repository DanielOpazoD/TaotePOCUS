"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Returns true while the user is typing in a form field or contenteditable.
 * Shortcut handlers should bail early when this is true so users typing
 * "g" in a comment don't get teleported.
 */
function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

/** Window of time after `g` is pressed during which a follow-up key
 *  counts as the second leg of the chord. Beyond this we reset. */
const G_TIMEOUT_MS = 1500;

const SECTION_BY_LETTER: Record<string, string> = {
  a: "/",
  e: "/ecg",
  c: "/cases",
  i: "/info",
  f: "/favoritos",
};

interface Options {
  /** Open the help modal when "?" is pressed. */
  onHelp: () => void;
}

/**
 * Global keyboard shortcuts. Idiomatic Gmail / GitHub:
 *
 *   ?       — open the shortcuts help modal
 *   j / k   — focus next / previous case card
 *   ← / →   — same as j / k (arrow alternative)
 *   g a     — go to Atlas POCUS
 *   g e/c/i — ECG / Cases / Info
 *   g f     — Favoritos
 *
 * The "/" shortcut for the search box is owned by the Header itself —
 * keeping it co-located with the input it focuses keeps the dependency
 * narrow.
 */
export function useShortcuts({ onHelp }: Options) {
  const router = useRouter();
  const gPending = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingInField(e.target)) return;

      // Two-key chord — second leg of `g <letter>`.
      if (gPending.current && Date.now() - gPending.current < G_TIMEOUT_MS) {
        const dest = SECTION_BY_LETTER[e.key.toLowerCase()];
        gPending.current = null;
        if (dest) {
          e.preventDefault();
          router.push(dest);
          return;
        }
      }

      switch (e.key) {
        case "?": {
          // `?` is shift+/, which the browser dispatches as the "?" character.
          e.preventDefault();
          onHelp();
          break;
        }
        case "g":
        case "G": {
          gPending.current = Date.now();
          break;
        }
        case "j":
        case "ArrowDown":
        case "ArrowRight": {
          if (e.key === "ArrowRight" && e.shiftKey) return;
          focusSibling(1);
          if (document.activeElement?.classList.contains("case-card")) e.preventDefault();
          break;
        }
        case "k":
        case "ArrowUp":
        case "ArrowLeft": {
          if (e.key === "ArrowLeft" && e.shiftKey) return;
          focusSibling(-1);
          if (document.activeElement?.classList.contains("case-card")) e.preventDefault();
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, onHelp]);
}

function focusSibling(direction: 1 | -1) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".case-card"));
  if (cards.length === 0) return;
  const active = document.activeElement;
  const currentIndex = active instanceof HTMLElement ? cards.indexOf(active) : -1;
  let next = currentIndex + direction;
  if (currentIndex === -1) next = direction === 1 ? 0 : cards.length - 1;
  next = Math.max(0, Math.min(cards.length - 1, next));
  cards[next]?.focus();
}

/** Public: list of shortcuts to render in the help modal. */
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["/"], label: "Buscar" },
  { keys: ["?"], label: "Mostrar atajos" },
  { keys: ["j", "↓"], label: "Caso siguiente" },
  { keys: ["k", "↑"], label: "Caso anterior" },
  { keys: ["g", "a"], label: "Ir a Atlas POCUS" },
  { keys: ["g", "e"], label: "Ir a ECG" },
  { keys: ["g", "c"], label: "Ir a Casos clínicos" },
  { keys: ["g", "i"], label: "Ir a Infografías" },
  { keys: ["g", "f"], label: "Ir a Favoritos" },
  { keys: ["Esc"], label: "Cerrar modal / volver" },
];

interface State {
  open: boolean;
}

/**
 * Hook + boolean toggle to drive the shortcuts help modal from App.
 * Pairs with `useShortcuts({ onHelp })`.
 */
export function useShortcutsModal(): {
  open: boolean;
  setOpen: (v: boolean) => void;
} {
  const [s, set] = useState<State>({ open: false });
  return {
    open: s.open,
    setOpen: (v) => set({ open: v }),
  };
}
