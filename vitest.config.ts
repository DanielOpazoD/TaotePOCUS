import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
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
