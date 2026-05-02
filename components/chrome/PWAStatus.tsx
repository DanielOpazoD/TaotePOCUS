"use client";

// PWA status surfaces. Two affordances mounted as a single hidden
// chrome element near the bottom of the viewport:
//
//   1. Offline banner — appears when `navigator.onLine` flips false.
//      Tells the user the catalog they're seeing is the cached
//      version, with a soft yellow accent (warning, not error).
//   2. Update toast — appears when a new Service Worker is waiting
//      to take over. Click "Recargar" calls `applyUpdate()` which
//      tells the waiting SW to `skipWaiting` and reload the page.
//
// Both are no-ops when the browser doesn't support Service Workers
// or when the network never drops.

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useServiceWorker } from "@/hooks/useServiceWorker";

export default function PWAStatus() {
  const online = useOnlineStatus();
  const { updateAvailable, applyUpdate } = useServiceWorker();

  return (
    <>
      {!online && (
        <div className="pwa-status pwa-status--offline" role="status" aria-live="polite">
          <span aria-hidden="true">⚠</span>
          <span>Estás sin conexión — viendo la versión guardada</span>
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
