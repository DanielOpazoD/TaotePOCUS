"use client";

// Open a `<dialog>` element on mount, close on unmount.
//
// The native `<dialog>` API requires an imperative `showModal()` call
// to actually present the dialog (otherwise the element is in the
// DOM but invisible). The cleanup mirror calls `close()` so the
// dialog doesn't linger if the parent unmounts without a graceful
// close path.
//
// **Why `useLayoutEffect` (not `useEffect`)**: `showModal()` flips
// the dialog's `open` attribute, which in turn enables the
// `dialog[open]` CSS rule (100vw × 100vh, etc.). Without it, the
// element exists but renders as `display: none` (the spec default
// for a closed dialog).
//
// The View Transitions API takes the NEW snapshot RIGHT AFTER
// React's commit phase + layout-effects finish. If we deferred
// `showModal()` to a regular `useEffect` (which runs AFTER paint),
// the snapshot would capture the dialog at `display: none` —
// effectively a page with no modal — and the user would see the
// catalog grid through where the modal should be for the duration
// of the transition, until the live useEffect fired and the dialog
// finally appeared. `useLayoutEffect` runs synchronously after
// commit, before paint, before the snapshot — so the dialog is
// already promoted to the top layer and visible when the browser
// captures pixels.
//
// We deliberately don't bind the dialog's `close` event back to
// the parent's `onClose`. The native `close` fires for both the
// Escape key and our own `dialog.close()` call in cleanup — using
// it as a close trigger creates a feedback loop where transient
// remounts (React strict mode, unrelated re-renders) close the
// dialog milliseconds after it opens. The host component owns
// every close path explicitly (Escape via keydown, backdrop click,
// close button, swipe gesture).

import { useLayoutEffect, useRef } from "react";

export function useNativeDialog<T extends HTMLDialogElement>() {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return ref;
}
