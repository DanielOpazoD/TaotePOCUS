"use client";

// Replaces window.confirm() — see audit §8 (UX/UI). The native confirm is
// unstyled, blocking, and breaks the visual language of the app.
//
// Built on the native <dialog> element opened via showModal(): the
// browser handles top-layer rendering, makes the rest of the page
// inert (real focus trap, Tab cannot escape), and styles the backdrop
// via ::backdrop. We still listen for Escape ourselves so we can fire
// onCancel synchronously and we layer useFocusTrap as belt-and-braces
// for older browsers.

import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface Props {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      } else if (e.key === "Escape") {
        // The native <dialog> dispatches a `cancel` event on Escape,
        // but only when focus is inside it. Belt-and-braces: a global
        // listener guarantees we catch it.
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onConfirm, onCancel]);

  // Native dialog: clicking on the dialog element itself (not its
  // children) means the user clicked the backdrop — close.
  const onClickDialog = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog-host"
      // No native `close` listener — the unmount cleanup calls
      // `dialog.close()`, which fires the `close` event and would
      // re-enter `onCancel` on transient remounts. Escape, backdrop,
      // and the cancel button all call onCancel directly below.
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={onClickDialog}
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby={message ? "confirm-message" : undefined}
    >
      <div className="auth-modal confirm-dialog" ref={trapRef}>
        <h2 id="confirm-title">{title}</h2>
        {message && <p id="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
