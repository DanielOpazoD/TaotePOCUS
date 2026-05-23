import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      // `json-summary` writes `coverage/coverage-summary.json` which the
      // CI step parses to surface the totals in the GitHub job summary.
      // `text` gives the local terminal output; `html` is the local
      // browseable report developers open from `coverage/index.html`.
      reporter: ["text", "html", "json-summary"],
      include: ["lib/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
      exclude: [
        "**/*.d.ts",
        "**/index.ts", // barrel files have no logic
        "lib/data.ts", // seed dataset, not behavior
        "lib/icons.tsx",
        // Firebase modules require a configured project (or the emulator
        // suite) to exercise. Covered by an integration test suite that
        // is out of scope for `npm test`. Excluded so the unit threshold
        // reflects the code we actually exercise locally.
        "lib/firebase.ts",
        "lib/firebase-*.ts",
        // Netlify Blobs wrapper requires a real Netlify environment
        // (`getStore` reads from the request context). The integration
        // surface is exercised through the `/api/media/[id]` route in
        // e2e; unit-testing this file would only mock-around the SDK.
        "lib/blobs.ts",
        // Lazy-loader for the auto-generated 6055-LOC seed corpus.
        // Exercised by every app load — not a unit-test target.
        "lib/seed-cases.ts",
        // Server-side counterpart (Node `fs.readFile` at build time).
        // Same shape as `seed-cases.ts` — a thin loader, exercised
        // by the full build pipeline and the sitemap render.
        "lib/seed-cases.server.ts",
        // Client-side Clerk helper. The server resolution is covered
        // in `lib/server/session.ts` tests.
        "lib/clerk-auth.ts",
        // Search-result text highlighter (substring → React
        // fragments). Pinned by the visual e2e snapshots; a unit
        // test would only restate the regex.
        "lib/highlight.tsx",
        // Storage-status re-export module: a single one-liner
        // (`export { isUsingMemoryStorage } from "./store"`) that
        // exists only to dodge the ESLint guard against importing
        // `lib/store` from components. No logic to test.
        "lib/storage-status.ts",
        // AI provider implementations that wrap external SDKs.
        // Each is a thin adapter (~150 LOC) over `@google/genai`
        // or `openai`; the contract surface (request shape, response
        // shape, error semantics) is exercised end-to-end via
        // `tests/ai-route-handlers.test.ts` against the stub
        // provider. Testing these directly would require mocking
        // the SDK clients, which mostly re-asserts the SDK's own
        // type contract. The stub (covered) + registry (covered)
        // already pin the interface; if a provider regresses,
        // route-level integration smoke catches it.
        "lib/ai/gemini.ts",
        "lib/ai/openai-compat.ts",
        // Interface-only file: pure type exports + one defensive
        // error class. The error path is covered by the route
        // handler's 503 branch which the test suite exercises.
        // Excluding here keeps the lib/** aggregate honest about
        // logic coverage rather than typedef-counting.
        "lib/ai/provider.ts",
        // Service Worker bridge for the selective-offline media
        // feature. Every function in this file is either a thin
        // `navigator.serviceWorker.controller.postMessage` round-
        // trip with a MessageChannel reply, or a synchronous
        // localStorage shim (the bootstrap read for first paint).
        // The contract that matters is the message-shape agreement
        // with `app/sw.ts` — unit-testing this side in isolation
        // mostly mocks the ServiceWorker API surface back at us.
        // The integration is exercised by the offline-cases e2e
        // ("save case while online, navigate offline, confirm video
        // plays from cache") in `tests/e2e/offline.spec.ts`.
        "lib/offline-cases.ts",
      ],
      // Per-glob thresholds. CI fails if a PR drops coverage below these
      // without justification — keeps the unit-test contract real.
      //
      // `lib/` is the algorithmic core (storage, schemas, migrations,
      // localization, repo facade). Threshold tracks ~1pp under current
      // actuals (statements 93.4 / branches 85.5 / functions 97.2 /
      // lines 96.5) so any noticeable regression breaks the build.
      //
      // `hooks/` is React glue. Most surface is exercised through e2e,
      // so the bar is intentionally lower — we still want a floor to
      // catch the case where someone deletes a hook test wholesale.
      // Floor sits ~5pp under current actuals (statements 60.9 /
      // branches 50.8 / functions 58.9 / lines 64.0).
      thresholds: {
        "lib/**": {
          statements: 92,
          branches: 84,
          functions: 95,
          lines: 95,
        },
        "hooks/**": {
          statements: 55,
          branches: 45,
          functions: 55,
          lines: 60,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
