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
import ErrorBoundary from "./ErrorBoundary";
import { CaseModal } from "./modals";
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
  const {
    openCase,
    isFav,
    onCloseCase,
    onFav,
    onShare,
    onPresent,
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
                <h3>El caso no pudo abrirse</h3>
                <p>Detalles: {error.message}</p>
                <button type="button" className="boundary-fallback-retry" onClick={onCloseCase}>
                  Cerrar
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
          adminPipeline.pendingDelete ? `¿Eliminar "${adminPipeline.pendingDelete.title}"?` : ""
        }
        message="El caso se mueve a la Papelera y puedes restaurarlo desde el panel admin."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        onConfirm={adminPipeline.confirmDelete}
        onCancel={adminPipeline.cancelDelete}
      />

      <ConfirmDialog
        open={!!adminPipeline.pendingPurge}
        title={
          adminPipeline.pendingPurge
            ? `¿Eliminar permanentemente "${adminPipeline.pendingPurge.title}"?`
            : ""
        }
        message={
          "Esto borra el caso y su archivo de media (imagen / video) de forma definitiva. " +
          "No aparece en la papelera ni se puede restaurar desde la app — la única forma de " +
          "recuperarlo sería importar un backup JSON anterior. ¿Continuar?"
        }
        confirmLabel="Eliminar para siempre"
        cancelLabel="Cancelar"
        destructive
        onConfirm={adminPipeline.confirmPurge}
        onCancel={adminPipeline.cancelPurge}
      />

      <ShortcutsModal open={shortcutsOpen} onClose={onCloseShortcuts} />

      <PWAStatus />
    </>
  );
}
