"use client";

// Modal mounting layer. Hosts every dialog the app can open from
// the orchestrator (`App.tsx`):
//
//   - CaseModal           — public read view of one case
//   - PresentationMode    — fullscreen presentation cinema
//   - AuthModal           — login / signup (Clerk SignIn or legacy)
//   - CaseForm            — admin: create / edit one case
//   - ConfirmDialog × 2   — admin destructive flows (delete / purge)
//   - ShortcutsModal      — keyboard help (`?`)
//   - PWAStatus           — offline banner + update toast
//
// Lifted out of `App.tsx` in May-2026: the orchestrator was hosting
// 110 lines of modal-mounting JSX inside its render which made the
// data-flow story (state + hooks + side-effects) hard to follow.
// All the modals are conditional on parent state, so they render
// to nothing when the corresponding flag is false — moving them
// into a single component costs no runtime, gains a lot of clarity.

import dynamic from "next/dynamic";
import { useEffect } from "react";
import ErrorBoundary from "./ErrorBoundary";
import { CaseModal } from "./modals";
import { useLanguage } from "@/hooks/useLanguage";
import { getCaseTitle } from "@/lib/case-localized";
import type { CaseRecord, Category, User } from "@/lib/types";
import type { AuthErrorCode } from "@/lib/errors";
import type { Command as PaletteCommand } from "./modals/CommandPalette";

// Lazy-loaded subtrees: each shows up only on a specific flag.
// Keeping them out of the initial bundle preserves first-paint on
// the home grid (audit §9). The `ssr: false` is needed for the
// ones that touch `navigator` / dialog APIs immediately.
const CaseForm = dynamic(() => import("./admin/CaseForm"), { ssr: false });
const PresentationMode = dynamic(() => import("./cine/PresentationMode"), { ssr: false });
const ConfirmDialog = dynamic(() => import("./modals/ConfirmDialog"), { ssr: false });
const ShortcutsModal = dynamic(() => import("./modals/ShortcutsModal"), { ssr: false });
const CommandPalette = dynamic(() => import("./modals/CommandPalette"), { ssr: false });
const PWAStatus = dynamic(() => import("./chrome/PWAStatus"), { ssr: false });
// AuthModal embeds Clerk's `<SignIn />` widget which pulls a ~120KB
// chunk of the Clerk SDK. Most catalog visitors never click "Entrar"
// — keep the widget out of the initial bundle and code-split it.
const AuthModal = dynamic(() => import("./modals/AuthModal"), { ssr: false });

/**
 * Warm the lazy modal chunks immediately after first paint. Without
 * this, the first click on "Entrar" / `?` / a delete button triggers
 * a network fetch for the chunk; the wrapper renders nothing while
 * it waits, then mounts the dialog in a second frame. The brief gap
 * between "wrapper renders null" and "dialog DOM attached" is the
 * race the Playwright admin specs hit (`element was detached from
 * the DOM, retrying`) on slower CI runners — Chromium grabs the
 * rendering intermediate frame before React finishes reconciling.
 *
 * History (May-2026): an earlier version of this function ran via
 * `requestIdleCallback` with a 2-second timeout (and a 1.5-second
 * `setTimeout` fallback for Safari < 17). On busy CI runners idle
 * never fired before the deadline, so the preload would land at the
 * 2-second mark — long AFTER the e2e suite had already clicked
 * "Entrar" (~300-500 ms into the run). The chunk then loaded
 * on-demand and the race window stayed open. The chronic
 * `admin.spec` flake tracked back to that timing.
 *
 * Replaced with a plain `setTimeout(0)` inside `useEffect`. The
 * callback fires on the next macrotask — after React's commit phase
 * and the browser's first paint — but FAR sooner than 2 seconds.
 * The chunks are in-flight by the time the user (or Playwright)
 * touches anything.
 *
 * Trade-off: real users now download the chunks during initial page
 * load instead of during idle. HTTP/2 multiplexing + low fetch
 * priority make the cost negligible (the home grid + cine canvases
 * are the bottleneck, not network bandwidth for a 120KB chunk).
 */
function preloadLazyModals() {
  // Bare `import()` calls trigger webpack to fetch + cache the same
  // chunks the `dynamic()` wrappers consume above. Webpack dedupes
  // by module identity, so when the user later triggers the actual
  // dynamic mount the chunk is already cached and the dialog DOM
  // attaches in the same frame as the wrapper render. The errors
  // are swallowed because a chunk-load failure here would just
  // mean the user pays the original on-demand cost — no worse
  // than not preloading at all.
  void import("./modals/AuthModal").catch(() => undefined);
  void import("./modals/ConfirmDialog").catch(() => undefined);
  void import("./modals/ShortcutsModal").catch(() => undefined);
}

interface AdminPipeline {
  pendingDelete: CaseRecord | null;
  pendingPurge: CaseRecord | null;
  confirmDelete: () => void;
  cancelDelete: () => void;
  confirmPurge: () => void;
  cancelPurge: () => void;
}

interface Props {
  // Case modal
  openCase: CaseRecord | null;
  isFav: boolean;
  onCloseCase: () => void;
  onFav: () => void;
  onShare: () => void;
  onPresent: () => void;
  /** Active text query — passed through to `<CaseModal>` so the
   *  matched substrings in title / description get the same `<mark>`
   *  treatment the grid cards already apply. Empty / undefined
   *  renders the modal text plain. */
  searchQuery: string;

  // Presentation
  presentingCase: CaseRecord | null;
  presentationCases: CaseRecord[];
  onClosePresentation: () => void;

  // Auth modal
  authOpen: boolean;
  onCloseAuth: () => void;
  onLogin: (input: {
    email: string;
    password: string;
    name?: string;
  }) => Promise<{ ok: true } | { ok: false; code: AuthErrorCode | "unknown"; message: string }>;

  // Case form (admin)
  formOpen: boolean;
  editingCase: CaseRecord | null;
  currentUser: User | null;
  categories: Category[];
  tagSuggestions: string[];
  onCancelForm: () => void;
  onSaveCase: (data: CaseRecord) => Promise<void> | void;

  // Admin pipeline (delete / purge confirms)
  adminPipeline: AdminPipeline;

  // Shortcuts modal
  shortcutsOpen: boolean;
  onCloseShortcuts: () => void;

  // Command palette (Cmd+K)
  paletteOpen: boolean;
  onClosePalette: () => void;
  /** Catalog of commands the palette can dispatch. Built upstream
   *  in `App.tsx` because the call sites for each command (open
   *  case, edit case, toggle theme, navigate) live there. */
  paletteCommands: PaletteCommand[];
  /** Dispatches a single command. Called when the user hits Enter
   *  on a row or clicks an option. The palette closes itself after
   *  delegating — the parent just needs to run the side effect. */
  onRunPaletteCommand: (cmd: PaletteCommand) => void;
}

export default function AppModals(props: Props) {
  const { lang, t } = useLanguage();
  // Warm the lazy-modal chunks immediately after first paint so the
  // first open isn't a network round-trip. `setTimeout(0)` schedules
  // a new macrotask, which runs after React's commit phase and the
  // browser's first paint without competing for the same frame. See
  // `preloadLazyModals` for the history (the earlier
  // `requestIdleCallback` approach was the source of the chronic
  // `admin.spec` e2e flake).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = setTimeout(preloadLazyModals, 0);
    return () => clearTimeout(timer);
  }, []);
  const {
    openCase,
    isFav,
    onCloseCase,
    onFav,
    onShare,
    onPresent,
    searchQuery,
    presentingCase,
    presentationCases,
    onClosePresentation,
    authOpen,
    onCloseAuth,
    onLogin,
    formOpen,
    editingCase,
    currentUser,
    categories,
    tagSuggestions,
    onCancelForm,
    onSaveCase,
    adminPipeline,
    shortcutsOpen,
    onCloseShortcuts,
    paletteOpen,
    onClosePalette,
    paletteCommands,
    onRunPaletteCommand,
  } = props;

  return (
    <>
      {openCase && (
        // The modal is the most error-prone subtree (dialog API,
        // focus trap, swipe gesture, scroll listener, kbd shortcuts,
        // CineLoop canvas). If it crashes we close it via the URL
        // patch so the user lands back on the grid instead of being
        // wedged inside a broken dialog.
        <ErrorBoundary
          name="modal"
          fallback={(error) => (
            <div className="boundary-fallback boundary-fallback--floating" role="alertdialog">
              <div className="boundary-fallback-inner">
                <h3>{t("modal.boundary.title")}</h3>
                <p>
                  {t("modal.boundary.detailsLabel")}: {error.message}
                </p>
                <button type="button" className="boundary-fallback-retry" onClick={onCloseCase}>
                  {t("modal.boundary.close")}
                </button>
              </div>
            </div>
          )}
        >
          <CaseModal
            caso={openCase}
            onClose={onCloseCase}
            isFav={isFav}
            onFav={onFav}
            onShare={onShare}
            onPresent={onPresent}
            searchQuery={searchQuery}
          />
        </ErrorBoundary>
      )}

      {presentingCase && (
        <PresentationMode
          cases={presentationCases}
          startId={presentingCase.id}
          onClose={onClosePresentation}
        />
      )}

      {authOpen && <AuthModal onClose={onCloseAuth} onLogin={onLogin} />}

      {formOpen && (
        <CaseForm
          initial={editingCase}
          currentUser={currentUser}
          categories={categories}
          tagSuggestions={tagSuggestions}
          onCancel={onCancelForm}
          onSave={onSaveCase}
        />
      )}

      <ConfirmDialog
        open={!!adminPipeline.pendingDelete}
        title={
          adminPipeline.pendingDelete
            ? t("confirm.delete.title", {
                title: getCaseTitle(adminPipeline.pendingDelete, lang).value,
              })
            : ""
        }
        message={t("confirm.delete.message")}
        confirmLabel={t("confirm.delete.confirm")}
        cancelLabel={t("confirm.delete.cancel")}
        destructive
        onConfirm={adminPipeline.confirmDelete}
        onCancel={adminPipeline.cancelDelete}
      />

      <ConfirmDialog
        open={!!adminPipeline.pendingPurge}
        title={
          adminPipeline.pendingPurge
            ? t("confirm.purge.title", {
                title: getCaseTitle(adminPipeline.pendingPurge, lang).value,
              })
            : ""
        }
        message={t("confirm.purge.message")}
        confirmLabel={t("confirm.purge.confirm")}
        cancelLabel={t("confirm.purge.cancel")}
        destructive
        onConfirm={adminPipeline.confirmPurge}
        onCancel={adminPipeline.cancelPurge}
      />

      <ShortcutsModal open={shortcutsOpen} onClose={onCloseShortcuts} />

      {/* Cmd+K command palette. Mounts conditionally because the
          lazy import shouldn't ship until the user actually opens
          it, but stays in the modal layer so it shares the same
          z-index / focus-trap conventions as the other dialogs. */}
      {paletteOpen && (
        <CommandPalette
          open={paletteOpen}
          onClose={onClosePalette}
          commands={paletteCommands}
          onRun={onRunPaletteCommand}
        />
      )}

      <PWAStatus />
    </>
  );
}
