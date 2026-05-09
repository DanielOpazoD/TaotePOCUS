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
      include: ["lib/**/*.{ts,tsx}"],
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
      ],
      // Hard floor for `lib/`. CI fails if a PR drops coverage below
      // these without justification — keeps the unit-test contract real.
      // `hooks/` are React glue, covered by the e2e suite, deliberately
      // not included here.
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
