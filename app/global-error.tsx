"use client";

// Root-level error boundary — catches errors that bubble all the way out
// of the layout. Replaces the entire <html> tree, so it must redefine it.
export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#fafaf7",
          color: "#15171a",
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 32,
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#8b8e93",
              marginBottom: 8,
            }}
          >
            Error crítico
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 500, margin: "0 0 12px" }}>
            La aplicación no pudo cargar
          </h1>
          <p style={{ color: "#4a4d52", margin: "0 0 24px" }}>
            Recarga la página o vuelve más tarde.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "10px 20px",
              background: "#15171a",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
