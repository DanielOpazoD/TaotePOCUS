"use client";

import { useCallback, useEffect, useState } from "react";
import { repo } from "@/lib/repo";
import { log } from "@/lib/log";
import type { CaseRecord } from "@/lib/types";

/**
 * Per-case override map keyed by case id. Each entry is a partial
 * `CaseRecord` with whatever fields the admin reclassified — title,
 * category, section, tags, summary, findings, diagnosis, featured,
 * position. The catalog merges these on top of the source case at
 * render time, so:
 *
 *   - The Twitter import script can regenerate `lib/imported-cases.ts`
 *     freely without losing edits.
 *   - Edits survive page reloads (localStorage).
 *   - Edits are reversible (`clearOverride(id)`).
 *
 * Mid-term: when Firebase lights up, the same hook switches to a
 * remote backend without consumer changes (the repo facade dispatches).
 *
 * Returns:
 *   - `overrides`: the full map (use `mergeWithOverrides` below for
 *     the common "apply across a list" pattern).
 *   - `setOverride(id, patch)`: shallow-merge `patch` into the
 *     current override for `id`. Pass `undefined` for any field to
 *     fall back to the source value.
 *   - `clearOverride(id)`: drop all admin edits for that case.
 *   - `hydrated`: false until the initial localStorage read resolves.
 */
export function useCaseOverrides() {
  // Initialize synchronously from localStorage so the very first
  // render already reflects deletions / purges / reclassifications.
  // Without this, the catalog would render with the raw seed
  // (showing deleted cases for one tick) and only snap to the
  // post-override count after the async hydration below — a visible
  // flicker the user noticed once the override map started
  // containing `purged` and `deletedAt` tombstones.
  //
  // The reader is a function (lazy initial state) so it only runs on
  // first mount, not on every render. SSR-safe: `Store.getCaseOverrides`
  // returns `{}` when `window` isn't available.
  const [overrides, setOverrides] = useState<Record<string, Partial<CaseRecord>>>(() => {
    try {
      return repo.cases.listOverridesCached();
    } catch {
      return {};
    }
  });
  // We treat the synchronous read as "hydrated enough" for the UI —
  // the async path below only matters when the DB has fresher state
  // than localStorage (Stage 3+). It refines but doesn't gate.
  const [hydrated, setHydrated] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Stage 3 path: when DB is enabled, this fetches the canonical
      // state from Postgres and refreshes the cache. When the local
      // backend is in use, this just returns the same data we already
      // have synchronously — no flicker, no extra render.
      const map = await repo.cases.listOverrides();
      if (!cancelled) {
        setOverrides(map);
        setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setOverride = useCallback(
    async (id: string, patch: Partial<CaseRecord>) => {
      // Optimistic local update so the UI reflects the change before
      // the localStorage write resolves. If the write fails we revert.
      const prev = overrides;
      const next: Record<string, Partial<CaseRecord>> = { ...prev };
      const merged: Partial<CaseRecord> = { ...(prev[id] || {}), ...patch };
      // Drop undefined-valued fields — caller's signal for "use the
      // source value" rather than "store undefined".
      for (const k of Object.keys(merged) as Array<keyof CaseRecord>) {
        if (merged[k] === undefined) delete merged[k];
      }
      if (Object.keys(merged).length === 0) {
        delete next[id];
      } else {
        next[id] = merged;
      }
      setOverrides(next);

      const result = await repo.cases.setOverride(id, merged);
      if (!result.ok) {
        log.warn("override save failed", {
          area: "caseOverrides",
          id,
          reason: result.reason,
        });
        setOverrides(prev);
        return false;
      }
      return true;
    },
    [overrides],
  );

  const clearOverride = useCallback(
    async (id: string) => {
      const prev = overrides;
      const next = { ...prev };
      delete next[id];
      setOverrides(next);
      const result = await repo.cases.clearOverride(id);
      if (!result.ok) {
        setOverrides(prev);
        return false;
      }
      return true;
    },
    [overrides],
  );

  return { overrides, setOverride, clearOverride, hydrated };
}

/**
 * Apply per-case overrides to a list. Pure helper, useful in
 * `useCaseFilters` or anywhere the consumer has both a list of
 * `CaseRecord`s and a map of overrides.
 */
export function mergeWithOverrides(
  cases: CaseRecord[],
  overrides: Record<string, Partial<CaseRecord>>,
): CaseRecord[] {
  if (Object.keys(overrides).length === 0) return cases;
  return cases.map((c) => {
    const patch = overrides[c.id];
    return patch ? { ...c, ...patch } : c;
  });
}
