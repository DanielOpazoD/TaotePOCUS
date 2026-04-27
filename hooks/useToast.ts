"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tiny toast queue.
 *
 * - One toast at a time. New `showToast` calls replace the current
 *   message and reset the timer.
 * - Auto-clears after `durationMs` (default 2000).
 * - The returned `showToast` is referentially stable, so it can be
 *   passed safely into other hooks / `useEffect` deps.
 *
 * Visual rendering and the `aria-live` mirror live in `App.tsx` —
 * this hook is just state.
 */
export function useToast(durationMs = 2000) {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string) => {
      setToast(message);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setToast(null), durationMs);
    },
    [durationMs],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { toast, showToast };
}
