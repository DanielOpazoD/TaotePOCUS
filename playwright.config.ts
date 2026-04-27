import { defineConfig, devices } from "@playwright/test";

// e2e configuration. Spawns the dev server automatically and tears it
// down at the end of the run. Tests live in `e2e/` so Vitest's `tests/`
// directory stays unit-only.

const PORT = process.env.PORT ? Number(process.env.PORT) : 3100;
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Build once, serve the static output. Faster + closer to prod than
    // running the dev server.
    command: `npm run build && PORT=${PORT} npm run start`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
