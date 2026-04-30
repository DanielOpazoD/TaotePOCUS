"use client";

import { useEffect, useState } from "react";

import { getSeedCasesSync, loadSeedCases } from "@/lib/seed-cases";
import type { CaseRecord } from "@/lib/types";

interface UseSeedCases {
  /** The bundled corpus, or `[]` until the chunk loads. */
  seed: CaseRecord[];
  /** True until `loadSeedCases` resolves the first time per page. */
  loading: boolean;
}

/**
 * React bridge for the lazy seed-cases loader. Components call this
 * instead of importing `SEED_CASES` directly so the 6800-line
 * dataset stays in its own code-split chunk.
 *
 * The lazy-initial-state form of `useState` is intentional: if the
 * cache is already populated (e.g. a sibling component triggered the
 * load), the component renders the full catalog on first paint —
 * no flash-of-empty.
 */
export function useSeedCases(): UseSeedCases {
  const [seed, setSeed] = useState<CaseRecord[]>(() => getSeedCasesSync() ?? []);
  const [loading, setLoading] = useState<boolean>(() => getSeedCasesSync() === null);

  useEffect(() => {
    if (getSeedCasesSync() !== null) {
      // Already cached — make sure local state is in sync (handles
      // the case where a remount happens after the cache populated).
      setSeed(getSeedCasesSync() ?? []);
      setLoading(false);
      return;
    }
    let cancelled = false;
    loadSeedCases()
      .then((data) => {
        if (cancelled) return;
        setSeed(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // On failure leave `seed` empty so the catalog falls back to
        // user-uploaded content. The chunk will be retried on the
        // next mount that calls `loadSeedCases`.
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { seed, loading };
}
