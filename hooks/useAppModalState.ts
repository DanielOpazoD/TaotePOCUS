"use client";

// Bundle of every "is this transient modal open?" flag the
// orchestrator (`App.tsx`) used to declare as six separate
// `useState` calls. Pulling them into one hook serves three
// purposes:
//
//   1. **Clarity at the orchestrator level.** `const modals =
//      useAppModalState()` makes the modal layer's surface
//      one named concept instead of six anonymous flags.
//   2. **Single import surface for `<AppModals>`.** Future PRs
//      can pass `modals` as a single prop instead of six
//      individually-named ones (cuts the AppModals prop count
//      by ~12 entries).
//   3. **Refactor safety.** When a new dialog is added (e.g. the
//      SettingsPanel was bolted on in PR #118), the addition
//      lands in one place + the type widens once.
//
// The hook is deliberately mechanical — no derivations, no
// memoization. Each flag is its own React state, the setters are
// the raw React setters. The orchestrator (and any future
// consumer) can read or write a single flag without re-triggering
// any other flag's render path.
//
// `editingCase` is bundled here too because it pairs with
// `formOpen` (the case-form dialog targets either a fresh case
// or the editingCase one) — keeping the two together prevents
// drift where `formOpen` is true but `editingCase` is null
// without intent.

import { useState } from "react";
import type { CaseRecord } from "@/lib/types";

export interface AppModalState {
  /** Auth modal — opened from "Entrar" button (or fav-as-anon). */
  authOpen: boolean;
  setAuthOpen: (open: boolean) => void;

  /** Case form modal — admin create / edit. Paired with
   *  `editingCase` (the case being edited; null when creating). */
  formOpen: boolean;
  setFormOpen: (open: boolean) => void;
  editingCase: CaseRecord | null;
  setEditingCase: (caso: CaseRecord | null) => void;

  /** Mobile drawer — the hamburger nav. */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;

  /** Keyboard shortcuts help dialog (`?`). */
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;

  /** Per-device preferences dialog (SettingsPanel from PR #118). */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  /** Command palette (Cmd+K / Ctrl+K). */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;

  /** Tag explorer modal — opens from the sidebar's "Ver todas"
   *  link or future palette commands. Lists every tag, supports
   *  search + click-to-filter; admin sees per-tag delete + restore. */
  tagExplorerOpen: boolean;
  setTagExplorerOpen: (open: boolean) => void;
}

export function useAppModalState(): AppModalState {
  const [authOpen, setAuthOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<CaseRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tagExplorerOpen, setTagExplorerOpen] = useState(false);

  return {
    authOpen,
    setAuthOpen,
    formOpen,
    setFormOpen,
    editingCase,
    setEditingCase,
    drawerOpen,
    setDrawerOpen,
    shortcutsOpen,
    setShortcutsOpen,
    settingsOpen,
    setSettingsOpen,
    paletteOpen,
    setPaletteOpen,
    tagExplorerOpen,
    setTagExplorerOpen,
  };
}
