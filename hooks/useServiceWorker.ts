"use client";

import { useEffect, useState } from "react";

/**
 * Hook for hooking the lifecycle of a Serwist-installed Service
 * Worker. Returns `{ updateAvailable, applyUpdate }`:
 *
 *   - `updateAvailable`: flips `true` when a new SW is waiting to
 *     activate. The UI surfaces a "Hay una versión nueva" toast.
 *   - `applyUpdate()`: tells the waiting SW to take over via
 *     `skipWaiting`, then reloads the page once it does. The page
 *     reload is gated on the `controllerchange` event so the new
 *     SW is actually controlling the page when the reload runs.
 *
 * Without this hook the SW we publish in `app/sw.ts` already uses
 * `skipWaiting + clientsClaim` to push itself live on every install,
 * so most updates land silently. The toast is a fallback for the
 * rare cases where the user has multiple tabs open and the SW
 * waits for all of them to release.
 *
 * SSR safe: every `navigator`/`window` access is gated on
 * `typeof !== "undefined"` and runs from a `useEffect`.
 */
export function useServiceWorker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    // The Serwist runtime registers the SW for us, but we still
    // need a handle to listen for `updatefound`. Wait for it via
    // the `ready` promise.
    void navigator.serviceWorker.ready.then((reg) => {
      if (cancelled) return;
      const checkWaiting = () => {
        if (reg.waiting) setUpdateAvailable(true);
      };
      checkWaiting();

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            // A new SW finished installing while an old one is
            // still in control — that's the "update waiting" state.
            setUpdateAvailable(true);
          }
        });
      });
    });

    // When the controller switches (because we called
    // `skipWaiting`), reload the page so the new assets take effect.
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const applyUpdate = () => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready.then((reg) => {
      reg.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
  };

  return { updateAvailable, applyUpdate };
}
