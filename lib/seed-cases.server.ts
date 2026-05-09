import "server-only";

// Server-side loader for the imported cases corpus.
//
// `app/sitemap.ts` (build-time) and any future RSC consumer that
// needs the full catalog import from here. We read the JSON file
// directly off disk via `fs` rather than going through `fetch` so
// the loader doesn't depend on `NEXT_PUBLIC_SITE_URL` being set at
// build time, and so Node built-ins stay out of the browser bundle
// (the parallel `lib/seed-cases.ts` is the client path; those two
// modules share no code so the bundler can tree-shake cleanly).
//
// `import "server-only"` at the top of the file makes Next.js fail
// the build if a client component ever imports it — protects the
// boundary by construction.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateCorpus } from "./schemas";
import type { CaseRecord } from "./types";

let cache: CaseRecord[] | null = null;

const CORPUS_FS_PATH = ["public", "data", "imported-cases.json"];

/**
 * Load the corpus from disk. Cached for the lifetime of the process
 * — `next build` runs `sitemap()` once, `next start` will reuse the
 * cached array across requests inside the same Node process.
 *
 * Validation goes through the same `validateCorpus` the client
 * loader uses, so the server / client see the same safe subset.
 * A malformed disk file → empty corpus + a warn log; sitemap
 * generation degrades to listing only sections, never crashes.
 */
export async function loadSeedCasesServer(): Promise<CaseRecord[]> {
  if (cache) return cache;
  const full = join(process.cwd(), ...CORPUS_FS_PATH);
  const raw = await readFile(full, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const { cases } = validateCorpus(parsed, "seed-cases.server");
  cache = cases;
  return cache;
}
