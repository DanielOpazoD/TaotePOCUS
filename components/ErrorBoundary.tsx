"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { log } from "@/lib/log";

interface Props {
  /** Identifier for the boundary — used in logs and the fallback copy. */
  name: string;
  /** Optional custom fallback UI. Defaults to a styled message. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Children to render when no error has been caught. */
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Granular error boundary.
 *
 * Catches render-time + lifecycle errors thrown by descendants, logs
 * them through `lib/log` (so Sentry sees them once it's wired), and
 * renders a contained fallback so the rest of the app stays usable.
 *
 * Why not the default Next.js error.tsx? That one fires at route
 * level — a crash in the case modal otherwise tumbles the entire
 * page including the header / footer / nav. Wrapping smaller units
 * means one section can fail (and offer a retry) while the rest of
 * the page keeps working.
 *
 * Why a class? Error boundaries still require class components.
 * `react-error-boundary` would be nicer ergonomically but it's not
 * a dependency we want to add for this — the component is small.
 *
 * Usage:
 *   <ErrorBoundary name="CaseModal">
 *     <CaseModal {...props} />
 *   </ErrorBoundary>
 *
 * Custom fallback:
 *   <ErrorBoundary name="grid" fallback={(err, reset) => <MyFallback ... />}>
 *
 * Reset:
 *   The default fallback offers a "Reintentar" button that clears
 *   the error state. Usually you also want to reset whatever state
 *   caused the crash — pass an `onReset` from the parent if needed.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Forward to the central log so Sentry / future transports get it
    // with a stable area tag. componentStack is the React tree path
    // and is gold for debugging — keep it in the payload.
    log.error(
      `boundary:${this.props.name} caught render error`,
      { area: `boundary:${this.props.name}`, componentStack: info.componentStack },
      error,
    );
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return <DefaultFallback name={this.props.name} error={error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({
  name,
  error,
  onReset,
}: {
  name: string;
  error: Error;
  onReset: () => void;
}) {
  return (
    <div className="boundary-fallback" role="alert">
      <div className="boundary-fallback-inner">
        <h3>Algo no funcionó en esta sección</h3>
        <p>
          {name === "modal"
            ? "El caso no pudo abrirse correctamente. "
            : "Esta parte de la página falló al cargar. "}
          Puedes reintentar o recargar la pestaña si persiste.
        </p>
        <details>
          <summary>Detalles técnicos</summary>
          <pre>
            {error.name}: {error.message}
          </pre>
        </details>
        <button type="button" className="boundary-fallback-retry" onClick={onReset}>
          Reintentar
        </button>
      </div>
    </div>
  );
}
