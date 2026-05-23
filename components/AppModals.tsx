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
import type { AppModalState } from "@/hooks/useAppModalState";

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
// SettingsPanel pulls the preferences UI (segmented controls,
// storage estimates, the offline-cases list). Reached only from
// the UserMenu's "Configuración" row — keep it out of the initial
// bundle so the public catalog doesn't pay for the prefs surface.
const SettingsPanel = dynamic(() => import("./modals/SettingsPanel"), { ssr: false });

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
 * Conditional gating (May-2026 perf pass): `AuthModal` carries the
 * Clerk `<SignIn />` widget (~120KB chunk). A logged-in user will
 * never open it during the session, so preloading wastes bandwidth
 * on the most common path. We now skip the AuthModal preload when
 * `currentUser` is non-null at decide-time. If they later log out
 * and click "Entrar", the chunk loads on demand — a one-shot ~300ms
 * delay vs. paying the 120KB cost on every authenticated session.
 * Confirm/Shortcuts stay always-preloaded (small, broadly useful).
 */
function preloadLazyModals(opts: { skipAuth: boolean }) {
  // Bare `import()` calls trigger webpack to fetch + cache the same
  // chunks the `dynamic()` wrappers consume above. Webpack dedupes
  // by module identity, so when the user later triggers the actual
  // dynamic mount the chunk is already cached and the dialog DOM
  // attaches in the same frame as the wrapper render. The errors
  // are swallowed because a chunk-load failure here would just
  // mean the user pays the original on-demand cost — no worse
  // than not preloading at all.
  if (!opts.skipAuth) {
    void import("./modals/AuthModal").catch(() => undefined);
  }
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
  /** Bundled transient modal state from `useAppModalState`. Replaces
   *  the seven open/close prop pairs that used to live here
   *  separately. Close handlers for state-only dialogs (auth, form,
   *  settings, shortcuts, palette) are derived INSIDE this component
   *  from `modals.setX(false)`; close handlers for URL-state
   *  dialogs (case modal, presentation) still arrive as explicit
   *  props because the URL update is App.tsx's responsibility. */
  modals: AppModalState;

  // Case modal — URL-state-backed (`?caso=<id>`), not in `modals`.
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
  /** Whether the open case's media is already saved for offline.
   *  Drives the toggle's pressed state in the modal. */
  isOffline: boolean;
  /** True while a save / remove is in-flight via the SW message
   *  channel. Hides the toggle behind a spinner so a slow network
   *  round-trip doesn't read as "click ignored". */
  offlinePending: boolean;
  /** Flip the offline state for the open case. */
  onToggleOffline: () => void;

  // Presentation — URL-state-backed (`?presenting=<id>`), not in `modals`.
  presentingCase: CaseRecord | null;
  presentationCases: CaseRecord[];
  onClosePresentation: () => void;

  // Auth modal — the login callback. Open state + close are in
  // `modals` / derived; the actual login function lives in App.tsx.
  onLogin: (input: {
    email: string;
    password: string;
    name?: string;
  }) => Promise<{ ok: true } | { ok: false; code: AuthErrorCode | "unknown"; message: string }>;

  // Case form (admin) — data dependencies. Open state + editingCase
  // + cancel are in `modals` / derived.
  currentUser: User | null;
  categories: Category[];
  tagSuggestions: string[];
  onSaveCase: (data: CaseRecord) => Promise<void> | void;

  // SettingsPanel (per-device preferences + offline storage UI) —
  // data dependencies. Open state + close are in `modals` / derived.
  /** Full case corpus — the SettingsPanel resolves saved ids to
   *  case records for the offline list (title + media kind hint). */
  allCases: CaseRecord[];
  /** Currently-saved-for-offline case IDs from `useOfflineCases`.
   *  The SettingsPanel renders one row per id. */
  savedOfflineIds: Set<string>;
  /** Drops a single id from the offline cache + the parent's
   *  state. The panel calls this with the id of the case the user
   *  clicked "Remove" on. */
  onRemoveOffline: (caseId: string) => void;
  /** Drops every offline-cached case. The panel calls this from
   *  its "Liberar todo" button. */
  onPurgeOffline: () => void;

  // Admin pipeline (delete / purge confirms)
  adminPipeline: AdminPipeline;
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
  //
  // The 50ms defer (vs. the prior `setTimeout(0)`) gives `useSession`
  // a microtask budget to resolve its initial user state — legacy
  // session reads localStorage synchronously; Clerk surfaces its
  // client-cached user in the first render. By 50ms past first paint
  // we usually know whether to skip the AuthModal preload. If the
  // session resolves LATER, `currentUser` flips and the cleanup +
  // re-arm handles the re-preload (webpack dedupes import calls, so
  // the late skip-or-include decision is idempotent).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = setTimeout(() => {
      preloadLazyModals({ skipAuth: props.currentUser !== null });
    }, 50);
    return () => clearTimeout(timer);
  }, [props.currentUser]);
  const {
    openCase,
    isFav,
    modals,
    onCloseCase,
    onFav,
    onShare,
    onPresent,
    searchQuery,
    isOffline,
    offlinePending,
    onToggleOffline,
    presentingCase,
    presentationCases,
    onClosePresentation,
    onLogin,
    currentUser,
    categories,
    tagSuggestions,
    onSaveCase,
    allCases,
    savedOfflineIds,
    onRemoveOffline,
    onPurgeOffline,
    adminPipeline,
    paletteCommands,
    onRunPaletteCommand,
  } = props;
  // Derive the state-only close handlers from `modals`. Memoising
  // them isn't needed — each modal mount is itself conditional, so
  // these closures are only created when the corresponding dialog
  // is actually open + about to render the close button.
  const closeAuth = () => modals.setAuthOpen(false);
  const closeSettings = () => modals.setSettingsOpen(false);
  const closeShortcuts = () => modals.setShortcutsOpen(false);
  const closePalette = () => modals.setPaletteOpen(false);
  // CaseForm cancel does two things — close the form AND clear the
  // editingCase pointer — so it's worth its own named helper.
  const cancelForm = () => {
    modals.setFormOpen(false);
    modals.setEditingCase(null);
  };

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
            isOffline={isOffline}
            offlinePending={offlinePending}
            onToggleOffline={onToggleOffline}
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

      {modals.authOpen && <AuthModal onClose={closeAuth} onLogin={onLogin} />}

      {modals.settingsOpen && (
        <SettingsPanel
          onClose={closeSettings}
          allCases={allCases}
          savedOfflineIds={savedOfflineIds}
          onRemoveOffline={onRemoveOffline}
          onPurgeOffline={onPurgeOffline}
        />
      )}

      {modals.formOpen && (
        <CaseForm
          initial={modals.editingCase}
          currentUser={currentUser}
          categories={categories}
          tagSuggestions={tagSuggestions}
          onCancel={cancelForm}
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

      <ShortcutsModal open={modals.shortcutsOpen} onClose={closeShortcuts} />

      {/* Cmd+K command palette. Mounts conditionally because the
          lazy import shouldn't ship until the user actually opens
          it, but stays in the modal layer so it shares the same
          z-index / focus-trap conventions as the other dialogs. */}
      {modals.paletteOpen && (
        <CommandPalette
          open={modals.paletteOpen}
          onClose={closePalette}
          commands={paletteCommands}
          onRun={onRunPaletteCommand}
        />
      )}

      <PWAStatus />
    </>
  );
}
