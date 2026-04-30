"use client";

import { useEffect, useRef } from "react";
import { setMirrorFailureHandler } from "@/lib/db-mirror";

const RATE_LIMIT_MS = 5000;

/**
 * Stage 4 of the localStorage→Postgres transition: when a write
 * makes it to localStorage but fails to land in the DB, the repo /
 * hooks call `notifyMirrorFailure`, and we surface a single toast
 * to nudge the admin to re-sync.
 *
 * Rate-limited to one toast every 5 s so a sustained DB outage
 * during a flurry of admin clicks doesn't queue dozens of identical
 * messages. The local write already succeeded before this fires —
 * the user's data is safe in the browser.
 *
 * Pulled out of `App.tsx` so the App component stops owning the
 * mirror-handler effect. Single-purpose hook; the only knob is the
 * `notify` callback the parent supplies (typically `showToast`
 * from `useToast`).
 */
export function useMirrorFailureToast(notify: (msg: string) => void): void {
  const lastFiredRef = useRef(0);
  useEffect(() => {
    setMirrorFailureHandler(() => {
      const now = Date.now();
      if (now - lastFiredRef.current < RATE_LIMIT_MS) return;
      lastFiredRef.current = now;
      notify("Cambio guardado local · sincronización con la base de datos pendiente");
    });
    return () => setMirrorFailureHandler(null);
  }, [notify]);
}
