"use client";

// Route-level error boundary. Catches errors thrown in any client/server
// component below /app. Without this, an uncaught throw paints a white
// screen — see audit §3 (Estabilidad técnica).
import { useEffect } from "react";
import { log } from "@/lib/log";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    log.error("Uncaught render error", { area: "error-boundary", digest: error.digest }, error);
  }, [error]);

  return (
    <div className="error-fallback">
      <div className="error-fallback-inner">
        <div className="error-tag">Error</div>
        <h1>Algo salió mal</h1>
        <p>
          Ocurrió un error inesperado al cargar este contenido. Puedes reintentar o recargar la
          página completa.
        </p>
        {error.digest && <code className="error-digest">id: {error.digest}</code>}
        <div className="error-actions">
          <button className="btn-primary" onClick={() => reset()}>
            Reintentar
          </button>
          <button className="btn-ghost" onClick={() => location.reload()}>
            Recargar página
          </button>
        </div>
      </div>
    </div>
  );
}
