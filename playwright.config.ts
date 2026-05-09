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
    // Pin the browser locale so the i18n auto-detector
    // (`detectBrowserLang(navigator.language)`) resolves to Spanish
    // by default. Without this, Playwright's Chromium reports
    // `en-US` and the catalog auto-translates to English, breaking
    // every spec that asserts Spanish copy. EN-specific behavior
    // is exercised by overriding the URL `?lang=en` inside the
    // relevant spec.
    locale: "es-CL",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], locale: "es-CL" },
    },
  ],
  webServer: {
    // Build once, serve the static output. Faster + closer to prod than
    // running the dev server.
    //
    // Force the legacy auth path for e2e: the admin specs assume the
    // local AuthModal (`Bienvenido de vuelta` / admin@taote.pocus /
    // admin123 credentials), which only renders when
    // `IS_CLERK_ENABLED=false`. Without this override the build picks
    // up `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` from `.env.local` and
    // mounts the Clerk widget instead — the admin specs then can't
    // find the dialog and time out. Empty value => legacy.
    //
    // Same with the DB / Blobs envs: clear them so the build doesn't
    // try to call out to Netlify services that aren't configured for
    // local e2e (the local repo facade + the seed JSON corpus answer
    // every read the catalog needs).
    command:
      `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= NEXT_PUBLIC_USE_DB= ` +
      `npm run build && PORT=${PORT} ` +
      `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= NEXT_PUBLIC_USE_DB= ` +
      `npm run start`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
