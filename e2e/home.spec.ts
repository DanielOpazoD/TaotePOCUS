import { expect, test } from "@playwright/test";

test.describe("Home page", () => {
  test("renders the brand and the case grid", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Atlas POCUS/);
    await expect(page.getByRole("heading", { level: 1, name: /Atlas POCUS/ })).toBeVisible();
    // The atlas section grid renders cards from SEED_CASES (12) plus
    // any IMPORTED_CASES classified as atlas (variable). The bento
    // layout renders most as `.case-card` and a couple as `.quote-card`
    // (textual variant) — count both. Lower bound rather than exact
    // count so adding more imported cases doesn't break the test.
    const cards = page.locator(".case-card, .quote-card");
    expect(await cards.count()).toBeGreaterThanOrEqual(12);
  });

  test("navigates between sections via the header", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "ECG" }).click();
    await expect(page).toHaveURL(/\/ecg/);
    await expect(page.getByRole("heading", { level: 1, name: "ECG" })).toBeVisible();

    await page.getByRole("link", { name: "Casos clínicos" }).click();
    await expect(page).toHaveURL(/\/cases/);
    // /cases uses an editorial hero with its own title; assert the
    // section's hero shell is mounted instead of a literal section name.
    await expect(page.locator(".hero--cases")).toBeVisible();
  });

  test("opens a case modal and closes it with Esc", async ({ page }) => {
    await page.goto("/");
    const firstCard = page.locator(".case-card").first();
    await firstCard.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveURL(/caso=/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).not.toHaveURL(/caso=/);
  });
});
