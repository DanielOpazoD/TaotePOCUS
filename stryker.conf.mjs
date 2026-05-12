// Stryker mutation-testing config. Mutation testing answers the
// question coverage metrics can't: when a test runs the code, does
// it actually CHECK what the code does? A 100%-covered function
// with `expect(true).toBe(true)` passes coverage but kills 0
// mutants. Stryker mutates the source (flips operators, drops
// branches, swaps literals) and runs the test suite against each
// mutant. A "killed" mutant means at least one test failed; a
// "survived" mutant means the tests passed despite a broken
// behaviour — a real gap in assertion strength.
//
// Why opt-in (not on every PR):
//   - A full run mutates every node in scope and re-runs Vitest per
//     mutant. Even with `concurrency` + `incremental`, it's slow
//     (10-60+ minutes depending on scope).
//   - The signal is most useful periodically (weekly / before a
//     release) rather than per-commit. Wired as `npm run
//     test:mutation` + a scheduled CI job, not a PR gate.
//
// Scope: start narrow with the pure algorithmic core
// (`lib/i18n/index.ts` + `lib/relative-date.ts`). Both are
// high-coverage (>95% statements) AND have unit tests that exercise
// boundary behaviour — exactly where mutation testing's signal is
// sharpest. Expanding the scope is a matter of adding glob entries
// to `mutate` below.
//
// References:
//   - https://stryker-mutator.io/docs/stryker-js/configuration/
//   - https://stryker-mutator.io/docs/stryker-js/vitest-runner/

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  // Vitest runner picks up `vitest.config.ts` automatically.
  // happy-dom (from our config) provides the DOM globals the i18n /
  // case-localized helpers occasionally read (e.g., `window` checks
  // inside `useLanguage`'s neighbours).
  testRunner: "vitest",
  testRunnerNodeArgs: ["--experimental-vm-modules"],
  vitest: {
    configFile: "vitest.config.ts",
  },

  // TypeScript checker compiles each mutant through `tsc` before
  // running the tests — mutants that produce TYPE errors (e.g.,
  // flipping `null` to `undefined` where the function returns
  // `string`) get rejected as "compile-errored" without burning a
  // full test-run cycle. Big speedup AND it surfaces mutations that
  // are pure type-noise.
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",

  // ── Scope ─────────────────────────────────────────────────────
  // Start with the pure functional core. Expand by appending globs
  // here. Files outside the scope are still loaded (their tests run
  // against the mutants of in-scope files) — they just don't get
  // mutated themselves.
  mutate: [
    "lib/i18n/index.ts",
    "lib/relative-date.ts",
    // Future expansion suggestions (uncomment when ready):
    //   "lib/case-localized.ts",     // bilingual case-content resolution
    //   "lib/schemas.ts",            // Zod validator rules
    //   "lib/storage-migrations.ts", // legacy-shape migration ladder
    //   "lib/saved-views.ts",        // saved-view CRUD reducer
  ],

  // ── Performance knobs ────────────────────────────────────────
  // `incremental: true` caches the per-mutant results in
  // `.stryker-tmp/incremental.json`. Subsequent runs only re-test
  // mutants in files that changed (or whose tests changed). First
  // run is full; CI's scheduled re-runs after a few days of small
  // changes finish in a fraction of the time.
  incremental: true,
  incrementalFile: ".stryker-tmp/incremental.json",
  tempDirName: ".stryker-tmp",
  // Two concurrent runners is conservative — keeps the CI runner
  // from oversubscribing on a 2-vCPU GitHub-hosted box. Bump
  // locally to half your CPU count for a faster run.
  concurrency: 2,
  // The Vitest runner shares one Vitest process for all mutants in
  // its concurrency lane; `restartTestRunnerEveryRun` would burn
  // the warm cache. Off by default — leave off.

  // ── Reporting ────────────────────────────────────────────────
  // `html` writes a browsable mutation report under `reports/`.
  // `clear-text` prints the table + survived-mutant list to stdout
  // for CI log + local visibility. `progress` is the live bar.
  reporters: ["html", "clear-text", "progress"],
  htmlReporter: {
    fileName: "reports/mutation/index.html",
  },

  // ── Thresholds ───────────────────────────────────────────────
  // Mutation score = killed / (killed + survived + no-coverage).
  //   high  → above this is "great" (90+)
  //   low   → between low and high is "acceptable" (75-90)
  //   break → BELOW this fails the run.
  //
  // Baseline on the initial scope (i18n/index.ts + relative-date.ts)
  // is 69.77% with 11 survived + 15 no-coverage mutants. The 15
  // no-coverage entries are mostly `lib/i18n/index.ts` defensive
  // branches (e.g., `formatDate` catch-block on missing Intl) that
  // unit tests deliberately skip — covering them needs separate
  // test cases, not stronger assertions on existing tests.
  //
  // Ratchet strategy: `break` sits at 65 today (~5pp under
  // baseline) so the gate has signal value without producing
  // permanent red. As tests improve we RAISE `break` toward `low`
  // and eventually toward `high`. The script lives in CI as a
  // scheduled job, not a PR gate — see `.github/workflows/
  // mutation.yml`.
  thresholds: {
    high: 90,
    low: 75,
    break: 65,
  },

  // ── Mutator-specific tuning ──────────────────────────────────
  // String-literal mutations (`"foo"` → `""`) are valuable for
  // catching tests that check truthy/falsy without verifying
  // content, but they generate noise in date-format strings (where
  // the literal IS the API surface and "" is correctly a no-op).
  // The default Stryker config already excludes obvious cases —
  // leave it tuned out-of-the-box for the first run.
  mutator: {
    plugins: null,
  },

  // ── Misc ─────────────────────────────────────────────────────
  // Logging: `info` keeps the CI log readable. Bump to `debug`
  // locally when a survived mutant is confusing and you want the
  // diff context.
  logLevel: "info",
  // The default timeout is 5000ms per test-run. Our suite finishes
  // in ~10s for the full set; a single-file mutant test ~200ms.
  // 30000ms gives plenty of headroom for the slowest mutant.
  timeoutMS: 30_000,
};

export default config;
