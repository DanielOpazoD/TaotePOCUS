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

// Lazy-loaded subtrees: each shows up only on a specific flag.
// Keeping them out of the initial bundle preserves first-paint on
// the home grid (audit §9). The `ssr: false` is needed for the
// ones that touch `navigator` / dialog APIs immediately.
const CaseForm = dynamic(() => import("./admin/CaseForm"), { ssr: false });
const PresentationMode = dynamic(() => import("./cine/PresentationMode"), { ssr: false });
const ConfirmDialog = dynamic(() => import("./modals/ConfirmDialog"), { ssr: false });
const ShortcutsModal = dynamic(() => import("./modals/ShortcutsModal"), { ssr: false });
const PWAStatus = dynamic(() => import("./chrome/PWAStatus"), { ssr: false });
// AuthModal embeds Clerk's `<SignIn />` widget which pulls a ~120KB
// chunk of the Clerk SDK. Most catalog visitors never click "Entrar"
// — keep the widget out of the initial bundle and code-split it.
const AuthModal = dynamic(() => import("./modals/AuthModal"), { ssr: false });

/**
 * Warm the lazy modal chunks during browser idle. Without this, the
 * first click on "Entrar" / `?` / a delete button triggers a network
 * fetch for the chunk; the wrapper renders nothing while it waits,
 * then mounts the dialog in a second frame. The brief gap between
 * "wrapper renders" and "dialog DOM attached" is the race the
 * Playwright admin specs hit (`element was detached from the DOM,
 * retrying`) on slower CI runners — Chromium grabs the rendering
 * intermediate frame before React finishes reconciling.
 *
 * Preloading on idle is fire-and-forget: the chunks fetch in the
 * background after the first paint, never delay anything visible,
 * and are already cached by the time the user clicks. For users
 * who never open a modal it's a few KB of speculative download —
 * cheap relative to the smoothness it buys.
 *
 * `requestIdleCallback` is the right primitive (only runs when the
 * main thread is genuinely free); the `setTimeout` fallback handles
 * Safari < 17 where it isn't yet exposed.
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
  /** Top-N related cases for the open case. Computed in App.tsx
   *  off `findRelatedCases(openCase, allCases)`. Empty when no case
   *  is open. */
  relatedCases: CaseRecord[];
  /** Open a related case from inside the modal. Same as the grid's
   *  card-open handler — wraps the URL patch in a view transition. */
  onOpenRelated: (c: CaseRecord) => void;

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
}

export default function AppModals(props: Props) {
  const { lang, t } = useLanguage();
  // Warm the lazy-modal chunks during idle so the first open isn't
  // a network round-trip. See `preloadLazyModals` for the why.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const idleApi = (
      window as Window & {
        requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
        cancelIdleCallback?: (handle: number) => void;
      }
    ).requestIdleCallback;
    if (typeof idleApi === "function") {
      // 2s deadline so a perpetually busy main thread still preloads.
      const id = idleApi(() => preloadLazyModals(), { timeout: 2000 });
      return () => {
        const cancel = (window as Window & { cancelIdleCallback?: (handle: number) => void })
          .cancelIdleCallback;
        if (typeof cancel === "function") cancel(id);
      };
    }
    // Safari < 17 fallback: post-paint timer. 1.5s gives the home
    // grid time to fully render its 30 cards + featured row before
    // we pay the chunk download.
    const timer = setTimeout(() => preloadLazyModals(), 1500);
    return () => clearTimeout(timer);
  }, []);
  const {
    openCase,
    isFav,
    onCloseCase,
    onFav,
    onShare,
    onPresent,
    relatedCases,
    onOpenRelated,
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
            relatedCases={relatedCases}
            onOpenRelated={onOpenRelated}
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

      <PWAStatus />
    </>
  );
}
