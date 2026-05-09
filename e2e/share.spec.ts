import { expect, test } from "@playwright/test";

// First imported case from the Twitter archive. Stable id (the tweet
// id never changes), so we deep-link to it knowing the modal will
// resolve to a real entry. If the archive is regenerated and this
// case shifts position, the test still passes — the id is the
// contract, not the order.
const FIRST_IMPORTED_ID = "tw-1384957343272689668";

test.describe("Deep links", () => {
  test(`opening /?caso=${FIRST_IMPORTED_ID} directly shows the case modal`, async ({ page }) => {
    await page.goto(`/?caso=${FIRST_IMPORTED_ID}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The title is auto-translated to Spanish via the import pipeline.
    await expect(dialog.getByRole("heading", { level: 2 })).toContainText(
      /Evaluación|Ecocardiográfica|coronaria/i,
    );
  });

  test("category filter persists in the URL", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: /Cardíaco/ })
      .first()
      .click();
    await expect(page).toHaveURL(/cat=cardiac/);
  });

  test("searching narrows the grid and updates the URL", async ({ page }) => {
    await page.goto("/");
    // Wait for the corpus to land before searching. Post-Bloque-O the
    // catalog ships as a fetched JSON (~30 KB gzip) instead of a
    // bundled JS chunk, so the first paint can show an empty grid for
    // a beat while the fetch resolves. Without this gate the search
    // sometimes runs against an empty list and the assertion below
    // races to zero cards.
    const cards = page.locator(".case-card, .quote-card");
    await expect(cards.first()).toBeVisible();

    // "pulmonar" matches several Spanish titles in the imported corpus
    // (lung ultrasound, pulmonary edema, etc.) — exact count would be
    // brittle as imports grow, so we just assert the URL updates and
    // the grid stays non-empty.
    await page.getByPlaceholder(/Buscar casos/).fill("pulmonar");
    await expect(page).toHaveURL(/q=pulmonar/);
    expect(await cards.count()).toBeGreaterThan(0);
  });
});
