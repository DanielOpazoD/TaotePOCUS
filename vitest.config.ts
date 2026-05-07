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
      include: ["lib/**/*.ts"],
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
        // Client-side Clerk helper. The server resolution is covered
        // in `lib/server/session.ts` tests.
        "lib/clerk-auth.ts",
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
