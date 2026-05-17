"use client";

// AI connection status badge. Mounted near the top of the admin
// panel so an admin can answer at a glance: "is the AI actually
// connected, or am I about to waste a click trying to translate?"
//
// Two layers of information:
//
//   1. **Static (registry snapshot).** Whether the resolved default
//      provider's env-var key is present in the deployment. Fast,
//      no network call beyond the initial `useAIProvider` fetch.
//      Shown as the provider name + "configurado" / "sin proveedor".
//
//   2. **Dynamic (health ping).** What happens when the admin
//      clicks "Probar conexión": a real round-trip to the provider
//      via `POST /api/admin/ai/health`. Returns the actual API
//      latency + the model id that responded, OR a structured
//      error message when the call fails (bad key, network issue,
//      account out of credits). The ping result replaces the static
//      label until the next mount or another click.
//
// Why both layers: the static check catches the common case (env
// var missing → admin needs to set it). The dynamic check catches
// the not-so-common-but-painful case (env var SET but wrong /
// expired / quota exhausted → admin would otherwise discover this
// inside the CaseForm translate flow, mid-edit).
//
// The ping costs ~$0.0001 per call (see route header for the
// rationale on reusing translate vs a dedicated health endpoint).
// Fire-on-demand only — never on every page load.

import { useCallback, useState } from "react";
import { useAIProvider, type AIProviderId } from "@/hooks/useAIProvider";

/** Shape returned by `POST /api/admin/ai/health`. Kept inline as a
 *  literal so the badge doesn't pull lib/ai types into the client
 *  bundle. Mirrors `HealthResponseOk | HealthResponseFail` in the
 *  route handler. */
interface HealthOk {
  providerId: AIProviderId;
  providerName: string;
  ok: true;
  latencyMs: number;
  model: string;
  checkedAt: string;
}
interface HealthFail {
  providerId: AIProviderId;
  providerName: string;
  ok: false;
  error: string;
  checkedAt: string;
}
type HealthResponse = HealthOk | HealthFail;

export function AIStatusBadge() {
  const ai = useAIProvider();
  const [pingResult, setPingResult] = useState<HealthResponse | null>(null);
  const [pinging, setPinging] = useState(false);
  const [pingError, setPingError] = useState<string | null>(null);

  const runPing = useCallback(async () => {
    setPinging(true);
    setPingError(null);
    setPingResult(null);
    try {
      const res = await fetch("/api/admin/ai/health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // No body → route picks the resolved default provider.
        body: "{}",
      });
      if (!res.ok) {
        // The route only returns 4xx on auth failure / malformed
        // input. Surface the status so the admin knows why.
        setPingError(`HTTP ${res.status}`);
        return;
      }
      const data: HealthResponse = await res.json();
      setPingResult(data);
    } catch (err) {
      setPingError(err instanceof Error ? err.message : String(err));
    } finally {
      setPinging(false);
    }
  }, []);

  if (ai.loading) {
    return (
      <div className="ai-status-badge ai-status-badge--loading" role="status">
        <span className="ai-status-badge-dot" aria-hidden="true" />
        <span className="ai-status-badge-label">IA: cargando…</span>
      </div>
    );
  }

  if (!ai.snapshot) {
    return (
      <div className="ai-status-badge ai-status-badge--error" role="status">
        <span className="ai-status-badge-dot" aria-hidden="true" />
        <span className="ai-status-badge-label">
          IA: no se pudo consultar el registro
          {ai.error ? ` (${ai.error})` : ""}
        </span>
      </div>
    );
  }

  const active = ai.snapshot.providers.find((p) => p.id === ai.snapshot!.defaultId);
  const isStub = ai.snapshot.defaultId === "stub";
  const providerName = active?.displayName ?? ai.snapshot.defaultId;

  // Visual state ladder:
  //   - stub          → orange dot ("configurá un provider real")
  //   - configured    → blue dot ("env var set, ping not run yet")
  //   - ping success  → green dot + latency + model
  //   - ping fail     → red dot + error text
  let modifier: "stub" | "configured" | "ok" | "fail";
  if (pingResult) {
    modifier = pingResult.ok ? "ok" : "fail";
  } else if (isStub) {
    modifier = "stub";
  } else {
    modifier = "configured";
  }

  return (
    <div
      className={`ai-status-badge ai-status-badge--${modifier}`}
      role="status"
      aria-live="polite"
    >
      <span className="ai-status-badge-dot" aria-hidden="true" />
      <span className="ai-status-badge-label">
        IA: <strong>{providerName}</strong>
      </span>
      <span className="ai-status-badge-state">
        {modifier === "stub" && "stub local · sin proveedor real configurado"}
        {modifier === "configured" && "configurado · sin verificar"}
        {modifier === "ok" && pingResult?.ok && (
          <>
            conectado · <span className="ai-status-badge-latency">{pingResult.latencyMs} ms</span>
            <span className="ai-status-badge-model"> · {pingResult.model}</span>
          </>
        )}
        {modifier === "fail" && pingResult && !pingResult.ok && (
          <span className="ai-status-badge-error" title={pingResult.error}>
            error: {pingResult.error}
          </span>
        )}
      </span>
      {!isStub && (
        <button
          type="button"
          className="ai-status-badge-button"
          onClick={runPing}
          disabled={pinging}
          aria-label="Probar la conexión con el proveedor de IA"
        >
          {pinging ? "Probando…" : pingResult ? "Reintentar" : "Probar conexión"}
        </button>
      )}
      {pingError && (
        <span className="ai-status-badge-error" role="alert">
          {pingError}
        </span>
      )}
    </div>
  );
}
