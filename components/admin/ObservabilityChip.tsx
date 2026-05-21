"use client";

// Observability status chip. Mounted next to `<AIStatusBadge>` at
// the top of the admin panel. Answers "is Sentry actually
// capturing errors?" at a glance — no Sentry-dashboard round-trip.
//
// Reads from `GET /api/admin/observability` on mount. The endpoint
// returns the live snapshot of `IS_SENTRY_ENABLED`, the resolved
// environment, and the DSN hostname (NOT the full DSN — the public
// key is stripped server-side).
//
// Visual states:
//   --on        green dot, "Sentry on (<environment>)"
//   --off       red dot, "Sentry off"
//   --loading   gray dot
//   --error     gray dot, error message
//
// Hover/click → opens a tooltip with the dsn hostname + commit sha.
// See `docs/runbooks/observability.md` for the verification flow.

import { useEffect, useState } from "react";

interface ObservabilityStatus {
  sentry: {
    enabled: boolean;
    environment: string;
    dsnHostname: string | null;
  };
  build: {
    nodeEnv: string;
    commitSha: string | null;
  };
}

type State =
  | { kind: "loading" }
  | { kind: "ok"; data: ObservabilityStatus }
  | { kind: "error"; message: string };

export function ObservabilityChip() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/observability");
        if (!res.ok) {
          if (!cancelled) setState({ kind: "error", message: `HTTP ${res.status}` });
          return;
        }
        const data: ObservabilityStatus = await res.json();
        if (!cancelled) setState({ kind: "ok", data });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="observability-chip observability-chip--loading" role="status">
        <span className="observability-chip-dot" aria-hidden="true" />
        <span>Observabilidad: cargando…</span>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="observability-chip observability-chip--error" role="status">
        <span className="observability-chip-dot" aria-hidden="true" />
        <span>Observabilidad: error ({state.message})</span>
      </div>
    );
  }

  const { sentry, build } = state.data;
  const modifier = sentry.enabled ? "on" : "off";
  // Compact label + a rich title with the host + commit sha for
  // hover-to-inspect. The body is admin-only and doesn't carry
  // the full DSN (only the host), so this is safe to render.
  const title = [
    `Sentry: ${sentry.enabled ? "enabled" : "DISABLED"}`,
    `Environment: ${sentry.environment}`,
    sentry.dsnHostname ? `Host: ${sentry.dsnHostname}` : "Host: (no DSN)",
    `Build: ${build.nodeEnv}`,
    build.commitSha ? `Commit: ${build.commitSha.slice(0, 8)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`observability-chip observability-chip--${modifier}`}
      role="status"
      title={title}
    >
      <span className="observability-chip-dot" aria-hidden="true" />
      <span>
        Sentry: <strong>{sentry.enabled ? "on" : "off"}</strong>
        {sentry.enabled && <span className="observability-chip-env"> · {sentry.environment}</span>}
      </span>
    </div>
  );
}
