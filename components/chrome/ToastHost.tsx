"use client";

// Toast renderer. Two surfaces share the same message:
//
//   - The visible chip: animated chrome (slide-up) with an
//     optional "Deshacer" button. Inert to screen readers so the
//     SR mirror below isn't read twice.
//   - The sr-only mirror: an aria-live="polite" / aria-atomic
//     region that announces the toast's text to AT users. The
//     undo affordance there is reachable via Tab on the visible
//     chip — we don't duplicate it.
//
// Lifted out of `App.tsx` in May-2026 as part of the modal /
// chrome split. The hook (`useToast`) still owns the queue +
// auto-dismiss timer; this is just the render piece.

import type { Toast } from "@/hooks/useToast";

interface Props {
  toast: Toast | null;
}

export default function ToastHost({ toast }: Props) {
  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {toast?.message ?? ""}
      </div>
      {toast && (
        <div className="toast">
          <span className="toast-message">{toast.message}</span>
          {toast.undo && (
            <button type="button" className="toast-undo" onClick={toast.undo}>
              {toast.undoLabel}
            </button>
          )}
        </div>
      )}
    </>
  );
}
