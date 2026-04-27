import { expect, test } from "@playwright/test";

test.describe("Deep links", () => {
  test("opening /?caso=c001 directly shows the case modal", async ({ page }) => {
    await page.goto("/?caso=c001");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Title from the seed data for c001.
    await expect(dialog.getByRole("heading", { level: 2 })).toContainText(/B-líneas/);
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
    await page.getByPlaceholder(/Buscar casos/).fill("tamponade");
    await expect(page).toHaveURL(/q=tamponade/);
    // Only the tamponade case should remain visible.
    const cards = page.locator(".case-card");
    await expect(cards).toHaveCount(1);
  });
});
