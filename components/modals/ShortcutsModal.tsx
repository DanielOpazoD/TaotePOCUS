"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/lib/icons";
import { SHORTCUTS } from "@/hooks/useShortcuts";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Help dialog showing every global keyboard shortcut. Triggered by `?`.
 * Built on the same native <dialog> + focus-trap pattern as the other
 * modals so behavior is consistent.
 */
export default function ShortcutsModal({ open, onClose }: Props) {
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
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onClickDialog = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog-host"
      // See CaseModal for why the native `close` event isn't wired —
      // it re-enters during unmount cleanup. Escape / backdrop /
      // close button all call onClose explicitly.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={onClickDialog}
      aria-labelledby="shortcuts-title"
    >
      <div className="auth-modal shortcuts-modal" ref={trapRef}>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Cerrar"
          style={{ top: 16, right: 16 }}
        >
          {Icon.close()}
        </button>
        <h2 id="shortcuts-title">Atajos de teclado</h2>
        <p>Navega y filtra sin tocar el ratón.</p>
        <ul className="shortcuts-list">
          {SHORTCUTS.map((s) => (
            <li key={s.label}>
              <span className="shortcuts-keys">
                {s.keys.map((k, i) => (
                  <span key={`${s.label}-${k}`}>
                    {i > 0 && <span className="shortcuts-then">luego</span>}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </span>
              <span className="shortcuts-label">{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
