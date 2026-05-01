"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Toast {
  /** Body text rendered in the chip and announced via aria-live. */
  message: string;
  /** When set, an "undo" affordance appears in the chip. Clicking
   *  it dismisses the toast and runs this callback. The toast also
   *  defaults to a longer auto-clear window (6 s) so the user has
   *  time to react. */
  undo?: () => void;
  /** Custom label for the undo affordance. Defaults to "Deshacer". */
  undoLabel: string;
}

export interface ShowToastOptions {
  /** Override the auto-clear window. Default 2000 ms (no undo) /
   *  6000 ms (with undo). */
  duration?: number;
  /** When set, the toast renders an undo button. The callback runs
   *  after the toast dismisses, so the visible feedback for the
   *  reverse action shows up cleanly without a stale chip. The
   *  return value is ignored — typed as `unknown` so callers don't
   *  have to wrap repo methods (which return Promise<boolean> for
   *  ok/fail) in a discarding closure. */
  undo?: () => unknown;
  /** Custom undo label. Default "Deshacer". */
  undoLabel?: string;
}

export type ShowToast = (message: string, options?: ShowToastOptions) => void;

/**
 * Tiny toast queue with optional undo affordance.
 *
 * - One toast at a time. New `showToast` calls replace the current
 *   message and reset the timer.
 * - Auto-clears after `defaultDurationMs` (default 2000) for
 *   info-only toasts; toasts that include `{ undo }` get a longer
 *   default window (6000 ms) so the user has time to react.
 * - The returned `showToast` is referentially stable, so it can
 *   still be passed as a `(msg: string) => void` callback to hooks
 *   that don't know about undo (the option arg is optional).
 *
 * Visual rendering and the `aria-live` mirror live in `App.tsx` —
 * this hook owns state + timer.
 */
export function useToast(defaultDurationMs = 2000) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback<ShowToast>(
    (message, options) => {
      const undoCb = options?.undo;
      // Wrap the user's callback so clicking undo also dismisses the
      // toast — saves callers from doing it manually and prevents the
      // stale chip from lingering after a successful reversal.
      const wrappedUndo = undoCb
        ? () => {
            dismissToast();
            void undoCb();
          }
        : undefined;
      setToast({
        message,
        undo: wrappedUndo,
        undoLabel: options?.undoLabel ?? "Deshacer",
      });
      if (timerRef.current) clearTimeout(timerRef.current);
      const ms = options?.duration ?? (undoCb ? 6000 : defaultDurationMs);
      timerRef.current = setTimeout(() => setToast(null), ms);
    },
    [defaultDurationMs, dismissToast],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { toast, showToast, dismissToast };
}
