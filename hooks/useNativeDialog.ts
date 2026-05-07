"use client";

// Open a `<dialog>` element on mount, close on unmount.
//
// The native `<dialog>` API requires an imperative `showModal()` call
// to actually present the dialog (otherwise the element is in the
// DOM but invisible). The cleanup mirror calls `close()` so the
// dialog doesn't linger if the parent unmounts without a graceful
// close path.
//
// We deliberately don't bind the dialog's `close` event back to
// the parent's `onClose`. The native `close` fires for both the
// Escape key and our own `dialog.close()` call in cleanup — using
// it as a close trigger creates a feedback loop where transient
// remounts (React strict mode, unrelated re-renders) close the
// dialog milliseconds after it opens. The host component owns
// every close path explicitly (Escape via keydown, backdrop click,
// close button, swipe gesture).

import { useEffect, useRef } from "react";

export function useNativeDialog<T extends HTMLDialogElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return ref;
}
