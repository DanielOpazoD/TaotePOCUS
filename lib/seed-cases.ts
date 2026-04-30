// Lazy loader for the bundled cases corpus.
//
// `lib/imported-cases.ts` is auto-generated from the @TaotePOCUS Twitter
// archive — currently 326 cases / ~6800 LOC. Eagerly importing it
// pulled the entire dataset into the initial client bundle, even on
// routes that show only a single case. The audit flagged this as the
// largest avoidable cost in the bundle budget.
//
// The fix: a dynamic `import()` here. Next.js / Turbopack treats the
// dynamic import as a code-split boundary and emits a separate chunk
// that the browser fetches on demand (the first time anything calls
// `loadSeedCases`). Subsequent calls reuse the in-memory cache so a
// re-render doesn't pay the network again.
//
// Server-side consumers (sitemap, future RSC) can also call this —
// `import()` works in Node — though there the bundle-size benefit is
// less critical because the server runs once at request time.
//
// Synchronous consumers (Footer count, useMergedCatalog merge) bridge
// to async via `hooks/useSeedCases.tsx`, which renders an empty
// catalog on first paint and updates once the chunk arrives.

import type { CaseRecord } from "./types";

let cache: CaseRecord[] | null = null;
let pending: Promise<CaseRecord[]> | null = null;

/**
 * Load the imported cases corpus. The first call triggers a dynamic
 * import and resolves once the chunk is ready; subsequent calls
 * return the cached array immediately. Errors propagate — callers
 * that want graceful degradation should `.catch` and fall back to
 * an empty catalog.
 */
export function loadSeedCases(): Promise<CaseRecord[]> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = import("./imported-cases")
      .then((m) => {
        cache = m.IMPORTED_CASES;
        return cache;
      })
      .catch((err) => {
        // Reset `pending` so a retry can re-attempt the import. The
        // caller decides whether to retry; we just don't want a
        // permanent stuck-in-failed-state.
        pending = null;
        throw err;
      });
  }
  return pending;
}

/**
 * Synchronous accessor. Returns the cached corpus on a hot path
 * after the first load, or `null` before. Hooks use this in their
 * lazy-initial-state form so a remount picks up the cached array
 * without a frame of empty state.
 */
export function getSeedCasesSync(): CaseRecord[] | null {
  return cache;
}
