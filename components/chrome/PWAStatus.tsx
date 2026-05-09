"use client";

// PWA status surfaces. Three affordances mounted as a single hidden
// chrome element near the bottom of the viewport:
//
//   1. Offline banner — appears when `navigator.onLine` flips false.
//      Tells the user the catalog they're seeing is the cached
//      version, with a soft yellow accent (warning, not error).
//   2. Update toast — appears when a new Service Worker is waiting
//      to take over. Click "Recargar" calls `applyUpdate()` which
//      tells the waiting SW to `skipWaiting` and reload the page.
//   3. Memory-storage banner — appears when the resolved storage
//      backend is the in-memory shim (Safari Private Mode,
//      sandboxed iframe). Tells the user their session is
//      transitory so they don't lose work without warning.
//
// All three are no-ops in normal conditions (online + functional
// localStorage + no SW update pending).

import { useEffect, useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import { isUsingMemoryStorage } from "@/lib/storage-status";

export default function PWAStatus() {
  const online = useOnlineStatus();
  const { updateAvailable, applyUpdate } = useServiceWorker();
  // Storage backend probe runs lazily on first read. We trigger it
  // post-mount via state so the SSR pass doesn't return `false`
  // and then re-render with `true` (causing a hydration mismatch
  // warning). The probe itself is sync once `window` exists.
  const [memoryStorage, setMemoryStorage] = useState(false);
  useEffect(() => {
    setMemoryStorage(isUsingMemoryStorage());
  }, []);

  return (
    <>
      {!online && (
        <div className="pwa-status pwa-status--offline" role="status" aria-live="polite">
          <span aria-hidden="true">⚠</span>
          <span>Estás sin conexión — viendo la versión guardada</span>
        </div>
      )}
      {memoryStorage && (
        <div
          className="pwa-status pwa-status--memory"
          role="status"
          aria-live="polite"
          title="El navegador no permite guardar datos en este modo. Lo que edites aquí se perderá al cerrar la pestaña."
        >
          <span aria-hidden="true">⏳</span>
          <span>Modo privado · esta sesión es temporal</span>
        </div>
      )}
      {updateAvailable && (
        <div className="pwa-status pwa-status--update" role="status" aria-live="polite">
          <span>Hay una versión nueva disponible</span>
          <button type="button" className="pwa-status-action" onClick={applyUpdate}>
            Recargar
          </button>
        </div>
      )}
    </>
  );
}
