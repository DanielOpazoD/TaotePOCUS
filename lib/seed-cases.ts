// Lazy loader for the bundled cases corpus.
//
// The corpus (~326 cases / ~133 KB minified) lives at
// `public/data/imported-cases.json` and is loaded on demand. Before
// Bloque O the data was a TypeScript array literal in
// `lib/imported-cases.ts` (~6055 LOC) that Next.js code-split into a
// separate JS chunk — but the chunk still had to be parsed and
// evaluated as JavaScript on every fresh page load. As JSON it skips
// the parser/evaluator entirely (the browser uses native `JSON.parse`
// which is implemented in C and ~5× faster than the JS engine for
// large literals), and the file can be cached by the CDN with
// long-lived headers.
//
// This module is the BROWSER-SIDE loader. It does a same-origin
// `fetch()` against the JSON URL. The Service Worker (when wired)
// caches the response so subsequent visits are instant.
//
// Server-side consumers (`app/sitemap.ts` at build time, future RSC)
// import from `lib/seed-cases.server.ts` instead — that file uses
// `fs.readFile` directly to avoid needing `NEXT_PUBLIC_SITE_URL` to
// be set at build time. Splitting the modules also keeps Node
// built-ins (`node:fs/promises`, `node:path`) out of the client
// bundle entirely.
//
// Synchronous consumers (Footer count, useMergedCatalog merge) bridge
// to async via `hooks/useSeedCases.tsx`, which renders an empty
// catalog on first paint and updates once the load resolves.

import type { CaseRecord } from "./types";

let cache: CaseRecord[] | null = null;
let pending: Promise<CaseRecord[]> | null = null;

/**
 * Path under `public/` that holds the corpus. Keep in sync with
 * `scripts/apply-twitter-import.mjs` (which writes here) and
 * `lib/seed-cases.server.ts` (which reads from this same location
 * via `fs`).
 */
export const CORPUS_PATH = "/data/imported-cases.json";

/**
 * Load the imported cases corpus over the network. The first call
 * triggers the fetch and resolves once the data is ready; subsequent
 * calls return the cached array immediately.
 *
 * Errors propagate — callers that want graceful degradation should
 * `.catch` and fall back to an empty catalog.
 */
export function loadSeedCases(): Promise<CaseRecord[]> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch(CORPUS_PATH, {
      // Long-lived caching: the JSON content is stable per deploy,
      // and the response headers on `public/` assets are configured
      // to allow aggressive caching.
      cache: "force-cache",
      // No credentials: it's a public dataset, no cookies needed.
      credentials: "omit",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load corpus: ${res.status}`);
        return res.json() as Promise<CaseRecord[]>;
      })
      .then((cases) => {
        cache = cases;
        return cases;
      })
      .catch((err) => {
        // Reset `pending` so a retry can re-attempt. The caller
        // decides whether to retry; we just don't want a permanent
        // stuck-in-failed-state.
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

/**
 * Test-only: clear the in-memory cache. Production code never
 * imports this; it exists so a fixture-changing test doesn't carry
 * the previous test's corpus into the next case.
 */
export function __resetSeedCacheForTests(): void {
  cache = null;
  pending = null;
}

/**
 * Test-only: pre-populate the cache. Used by tests that drive their
 * own in-memory dataset and don't want the loader to fetch at all.
 */
export function __setSeedCacheForTests(cases: CaseRecord[]): void {
  cache = cases;
  pending = Promise.resolve(cases);
}
