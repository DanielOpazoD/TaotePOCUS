"use client";

// Provider selection state for the admin AI flows. Two
// responsibilities:
//
//   1. Fetch the registry snapshot from `/api/admin/ai/providers`
//      once per session — used by the selector to know which
//      providers are available and what the server's default is.
//
//   2. Persist the admin's chosen provider in localStorage so the
//      choice survives page reloads. The persisted id is validated
//      against the snapshot on load (a stale localStorage entry
//      pointing at a no-longer-available provider falls back to
//      the server's default).
//
// Why a hook and not a context: only the CaseForm AI panel reads
// it today. If a future surface (bulk queue, admin chrome menu)
// also needs it, lift to a context provider then.

import { useCallback, useEffect, useState } from "react";
import { isTransient, withRetry } from "@/lib/errors/retry";
import {
  aiProvidersResponseSchema,
  type AIProvidersResponse,
} from "@/lib/schemas/api/ai-providers";

// Re-export the schema-derived types under the names this hook's
// consumers historically used. The previous local declarations
// duplicated the wire contract — single source of truth now lives
// in `lib/schemas/api/ai-providers.ts`.
//
// The runtime schema import lands in the admin chunk only:
// `useAIProvider` is reached exclusively from `AdminPanel`, which
// `components/MainGrid.tsx` lazy-loads via `next/dynamic`. The home
// page never executes this code path so zod stays out of the
// public bundle.
export type AIProviderId = AIProvidersResponse["defaultId"];
export type RegistrySnapshot = AIProvidersResponse;

const STORAGE_KEY = "taote.ai.selectedProvider";

interface State {
  /** Snapshot loaded from the server. `null` while pending. */
  snapshot: RegistrySnapshot | null;
  /** Network / parse error from the registry endpoint. */
  error: string | null;
  /** Whether the snapshot fetch is in flight. */
  loading: boolean;
}

export interface UseAIProvider {
  snapshot: RegistrySnapshot | null;
  error: string | null;
  loading: boolean;
  /**
   * The currently-selected provider id. Resolves to:
   *   1. The admin's persisted choice (if still available).
   *   2. Otherwise the server's `defaultId`.
   *   3. `null` until the snapshot loads.
   */
  selectedId: AIProviderId | null;
  /** Set the active provider. Persists to localStorage. */
  setSelectedId: (id: AIProviderId) => void;
  /** Refetch the snapshot — useful after env changes during dev. */
  refresh: () => void;
}

/**
 * Read the persisted selection synchronously on initial render so
 * the UI doesn't flash between the server default and the user's
 * choice. Returns `null` when the storage is empty or unavailable
 * (memory shim, SSR).
 */
function readPersistedSelection(): AIProviderId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    if (raw === "stub" || raw === "gemini" || raw === "openai" || raw === "deepseek") {
      return raw;
    }
  } catch {
    // memory shim throws; falls through to null.
  }
  return null;
}

export function useAIProvider(): UseAIProvider {
  const [state, setState] = useState<State>({
    snapshot: null,
    error: null,
    loading: true,
  });
  const [persisted, setPersisted] = useState<AIProviderId | null>(readPersistedSelection);

  const fetchSnapshot = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // Wrapped in `withRetry` so a transient upstream blip
      // (DeepSeek 429 / 503, brief network drop) doesn't surface
      // as a permanent "AI off" status to the admin. The
      // `isTransient` predicate filters: 4xx (except 408/429)
      // are NOT retried — those are real client errors (403
      // session expired, 404 endpoint gone) and need user
      // attention immediately.
      const data = await withRetry(
        async () => {
          const res = await fetch("/api/admin/ai/providers", { cache: "no-store" });
          if (!res.ok) {
            // 403 reaches here when the session expired — surface the
            // status so the UI can prompt re-auth instead of looking
            // mysteriously broken. The `HTTP <N>` shape is what
            // `isTransient` parses for retry classification.
            throw new Error(`HTTP ${res.status}`);
          }
          // Parse against the shared schema — catches server-side
          // shape drift (e.g. stale client cached against an updated
          // server, or a regression in the route's output that
          // somehow slipped past the server-side `safeParse`).
          // Throws a structured `ZodError` whose message carries the
          // first issue path so the UI's `error` state reads
          // actionable instead of "undefined is not an object".
          const json: unknown = await res.json();
          const parsed = aiProvidersResponseSchema.safeParse(json);
          if (!parsed.success) {
            const first = parsed.error.issues[0];
            const where = first ? `${first.path.join(".")}: ${first.message}` : "malformed";
            throw new Error(`provider snapshot shape drift — ${where}`);
          }
          return parsed.data;
        },
        {
          shouldRetry: (err, attempt) => attempt < 2 && isTransient(err),
          area: "ai-providers",
        },
      );
      setState({ snapshot: data, error: null, loading: false });
    } catch (err) {
      setState({
        snapshot: null,
        error: err instanceof Error ? err.message : String(err),
        loading: false,
      });
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  /**
   * Validated selected id. If the persisted choice points at a
   * provider that's no longer available (key revoked, snapshot
   * changed), fall through to the server default. The UI re-saves
   * the corrected selection so the next mount is fresh.
   */
  const selectedId: AIProviderId | null = (() => {
    if (!state.snapshot) return null;
    if (persisted) {
      const match = state.snapshot.providers.find((p) => p.id === persisted);
      if (match && match.availability.available) return persisted;
    }
    return state.snapshot.defaultId;
  })();

  const setSelectedId = useCallback((id: AIProviderId) => {
    setPersisted(id);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // memory shim — selection still lives in component state
        // for the current session, just won't survive reload.
      }
    }
  }, []);

  return {
    snapshot: state.snapshot,
    error: state.error,
    loading: state.loading,
    selectedId,
    setSelectedId,
    refresh: fetchSnapshot,
  };
}
