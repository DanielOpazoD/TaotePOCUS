import { expect, test, type Page } from "@playwright/test";

// Visual regression. Snapshots are platform-dependent (font rendering
// differs between macOS and Linux), so the baseline images saved by
// `--update-snapshots` should be regenerated on the OS where CI runs.
//
//     npm run test:e2e -- --update-snapshots e2e/visual.spec.ts
//
// We pin `reducedMotion=reduce` so the canvas cine-loop stays at frame
// zero and the skeleton pulse stops. The cine-loop canvases are masked
// because their speckle has non-deterministic noise even with reduced
// motion.

test.use({
  viewport: { width: 1280, height: 800 },
  colorScheme: "light",
});

// Pin reduced motion per-page rather than as a `test.use()` fixture —
// the type for `reducedMotion` varies across Playwright versions and
// `emulateMedia` is the stable API.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

const SCREENSHOT_OPTIONS = {
  // Slight tolerance for anti-alias / sub-pixel differences.
  maxDiffPixelRatio: 0.02,
  // Disable browser-level animations for the screenshot specifically.
  animations: "disabled" as const,
  // Wait for fonts to load fully so headings don't shift on second run.
  fullPage: true as const,
};

async function maskedScreenshot(page: Page, name: string) {
  await expect(page).toHaveScreenshot(name, {
    ...SCREENSHOT_OPTIONS,
    mask: [page.locator(".cine-canvas"), page.locator(".case-thumb-overlay")],
  });
}

test.describe("Visual regression", () => {
  test("home (Atlas POCUS)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".case-grid .case-card").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await maskedScreenshot(page, "home.png");
  });

  test("ECG section", async ({ page }) => {
    await page.goto("/ecg");
    await expect(page.locator(".case-grid .case-card").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await maskedScreenshot(page, "ecg.png");
  });

  test("clinical cases section", async ({ page }) => {
    await page.goto("/cases");
    await expect(page.locator(".case-grid .case-card").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await maskedScreenshot(page, "cases.png");
  });

  test("infographics section", async ({ page }) => {
    await page.goto("/info");
    // /info has zero entries in the imported corpus (everything came
    // in classified as atlas / ecg / cases) so the EmptyState
    // illustration is what's actually on screen. Wait for either the
    // grid OR the empty-state illustration so the snapshot covers
    // whichever the deploy produces.
    await expect(page.locator(".case-grid .case-card, .empty--illustrated").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await maskedScreenshot(page, "info.png");
  });

  test("dark mode home", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator(".case-grid .case-card").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await maskedScreenshot(page, "home-dark.png");
  });
});
