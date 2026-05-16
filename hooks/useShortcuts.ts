"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DictKey } from "@/lib/i18n";

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
  /** Fires on `⌘K` / `Ctrl+K`. Opens the command palette overlay
   *  (see `<CommandPalette>`). Passing `undefined` disables the
   *  binding — keeps the test suite + isolated stories minimal. */
  onCommandPalette?: () => void;
}

/**
 * Global keyboard shortcuts. Idiomatic Gmail / GitHub:
 *
 *   ?         — open the shortcuts help modal
 *   j / →     — focus next case card (linear, 1 step)
 *   k / ←     — focus previous case card (linear, 1 step)
 *   ↓         — focus card directly below (jumps a row in the grid)
 *   ↑         — focus card directly above (jumps a row in the grid)
 *   Home      — focus the first card
 *   End       — focus the last card
 *   g a       — go to Atlas POCUS
 *   g e/c/i   — ECG / Cases / Info
 *   g f       — Favoritos
 *
 * The arrow split: ←/→ stay linear so power-users can scan a row
 * one step at a time, ↑/↓ jump full rows so the cursor stays in
 * the same visual column on a 2D catalog grid. Linear's pattern.
 *
 * The "/" shortcut for the search box is owned by the Header itself —
 * keeping it co-located with the input it focuses keeps the dependency
 * narrow. Modal-scoped shortcuts (F/S/P for the action buttons, Esc)
 * live in CaseModal for the same reason.
 *
 * Every shortcut bails when the user is typing in a form field or
 * contenteditable — typing "g" in a comment doesn't trigger nav.
 *
 * @param options.onHelp - Called when the user presses `?`. Wire to
 *   open the ShortcutsModal.
 *
 * @example
 *   useShortcuts({ onHelp: () => setShortcutsOpen(true) });
 */
export function useShortcuts({ onHelp, onCommandPalette }: Options) {
  const router = useRouter();
  const gPending = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K — global command palette. Fires regardless of
      // focus context (text inputs included) because the palette IS
      // the navigation/edit surface; suppressing it while the user is
      // typing in the header search defeats its purpose. The handler
      // bails out fast when `onCommandPalette` isn't wired (tests,
      // future variant trees) to keep behaviour unchanged.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        if (onCommandPalette) {
          e.preventDefault();
          onCommandPalette();
        }
        return;
      }
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
        case "ArrowRight": {
          if (e.key === "ArrowRight" && e.shiftKey) return;
          if (focusGrid("next")) e.preventDefault();
          break;
        }
        case "k":
        case "ArrowLeft": {
          if (e.key === "ArrowLeft" && e.shiftKey) return;
          if (focusGrid("prev")) e.preventDefault();
          break;
        }
        case "ArrowDown": {
          if (e.shiftKey) return;
          if (focusGrid("down")) e.preventDefault();
          break;
        }
        case "ArrowUp": {
          if (e.shiftKey) return;
          if (focusGrid("up")) e.preventDefault();
          break;
        }
        case "Home": {
          if (focusGrid("first")) e.preventDefault();
          break;
        }
        case "End": {
          if (focusGrid("last")) e.preventDefault();
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, onHelp, onCommandPalette]);
}

type GridDirection = "next" | "prev" | "down" | "up" | "first" | "last";

/**
 * Move keyboard focus across the case grid. Returns `true` when a
 * card was focused (so the caller knows to `preventDefault` the
 * event); `false` when there's nothing to focus or the user's
 * focus is already elsewhere and the move would be intrusive.
 *
 * Column count is computed by counting cards that share the first
 * card's `top` coordinate — robust across the responsive grid (5
 * cols on Atlas wide / 4 / 3 / 2 narrow). Cheaper than reading the
 * grid container's computed `grid-template-columns` and works
 * identically across grid implementations.
 */
function focusGrid(direction: GridDirection): boolean {
  // Anchor-cover refactor (May-2026): `<CaseCard>` is now an
  // `<article>` (non-focusable) and the open-case action lives on a
  // `<a class="case-card-link">` inside the title. The grid-nav
  // shortcuts focus the LINK so Enter activates the case immediately,
  // and the `:focus-visible` ring on the anchor reads as the
  // card-level focus indicator (since the link's `::after` covers
  // the card and the global a11y ring picks up `a:focus-visible`).
  //
  // Falls back to `.case-card` selection if no anchor is found —
  // the test fixtures in `tests/useShortcuts.test.tsx` seed synthetic
  // `<button class="case-card">` elements directly and rely on this
  // behavior; production cards never trip the fallback.
  const links = Array.from(document.querySelectorAll<HTMLElement>(".case-card-link"));
  const cards =
    links.length > 0 ? links : Array.from(document.querySelectorAll<HTMLElement>(".case-card"));
  if (cards.length === 0) return false;

  const active = document.activeElement;
  const currentIndex = active instanceof HTMLElement ? cards.indexOf(active) : -1;

  // Direct-jump endpoints don't need column math.
  if (direction === "first") {
    cards[0]?.focus();
    return true;
  }
  if (direction === "last") {
    cards[cards.length - 1]?.focus();
    return true;
  }

  // No card focused yet: linear directions seed the first/last;
  // row directions also seed the first card (sensible default —
  // the user is asking "give me focus on the grid"). Either way
  // the move is intrusive only when the user explicitly pressed a
  // navigation key, which they did here.
  if (currentIndex === -1) {
    const seed = direction === "prev" || direction === "up" ? cards.length - 1 : 0;
    cards[seed]?.focus();
    return true;
  }

  // Linear neighbors.
  if (direction === "next") {
    cards[Math.min(currentIndex + 1, cards.length - 1)]?.focus();
    return true;
  }
  if (direction === "prev") {
    cards[Math.max(currentIndex - 1, 0)]?.focus();
    return true;
  }

  // Row jumps. Detect the column count from the cards themselves —
  // the grid is responsive, so reading the DOM is the only honest
  // source. Cards with the same vertical offset as the first card
  // are in the first row; that count is the column count.
  const firstCard = cards[0];
  if (!firstCard) return false;
  const firstTop = firstCard.getBoundingClientRect().top;
  let cols = 0;
  for (const c of cards) {
    if (Math.abs(c.getBoundingClientRect().top - firstTop) < 1) cols += 1;
    else break;
  }
  if (cols === 0) cols = 1;

  if (direction === "down") {
    const next = Math.min(currentIndex + cols, cards.length - 1);
    cards[next]?.focus();
    return true;
  }
  // direction === "up"
  const prev = Math.max(currentIndex - cols, 0);
  cards[prev]?.focus();
  return true;
}

/**
 * Public: list of shortcuts to render in the help modal.
 *
 * Each entry stores a `labelKey` (a `DictKey` in the i18n dictionary)
 * rather than a raw string — the help modal resolves it via `t()` at
 * render time so the same array drives both Spanish and English UIs.
 * TypeScript enforces that every key here also exists in both
 * `dict.es.ts` and `dict.en.ts`, so a typo or missing translation is
 * a compile error rather than a "Spanish in EN mode" bug at runtime.
 */
export const SHORTCUTS: { keys: string[]; labelKey: DictKey }[] = [
  { keys: ["/"], labelKey: "shortcuts.label.search" },
  { keys: ["?"], labelKey: "shortcuts.label.help" },
  { keys: ["j", "→"], labelKey: "shortcuts.label.nextCase" },
  { keys: ["k", "←"], labelKey: "shortcuts.label.prevCase" },
  { keys: ["↓"], labelKey: "shortcuts.label.below" },
  { keys: ["↑"], labelKey: "shortcuts.label.above" },
  { keys: ["Home"], labelKey: "shortcuts.label.first" },
  { keys: ["End"], labelKey: "shortcuts.label.last" },
  { keys: ["g", "a"], labelKey: "shortcuts.label.goAtlas" },
  { keys: ["g", "e"], labelKey: "shortcuts.label.goEcg" },
  { keys: ["g", "c"], labelKey: "shortcuts.label.goCases" },
  { keys: ["g", "i"], labelKey: "shortcuts.label.goInfo" },
  { keys: ["g", "f"], labelKey: "shortcuts.label.goFavs" },
  { keys: ["Esc"], labelKey: "shortcuts.label.close" },
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
