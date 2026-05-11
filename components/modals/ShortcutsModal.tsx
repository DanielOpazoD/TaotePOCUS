"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/lib/icons";
import { SHORTCUTS } from "@/hooks/useShortcuts";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useT } from "@/hooks/useLanguage";

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
  const t = useT();

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
          aria-label={t("shortcuts.close.aria")}
          style={{ top: 16, right: 16 }}
        >
          {Icon.close()}
        </button>
        <h2 id="shortcuts-title">{t("shortcuts.title")}</h2>
        <p>{t("shortcuts.intro")}</p>
        <ul className="shortcuts-list">
          {SHORTCUTS.map((s) => {
            const label = t(s.labelKey);
            return (
              <li key={s.labelKey}>
                <span className="shortcuts-keys">
                  {s.keys.map((k, i) => (
                    <span key={`${s.labelKey}-${k}`}>
                      {i > 0 && <span className="shortcuts-then">{t("shortcuts.then")}</span>}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </span>
                <span className="shortcuts-label">{label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </dialog>
  );
}
