import { expect, test } from "@playwright/test";

test.describe("Admin flow", () => {
  test("admin can log in and reach the panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar" }).click();
    const dialog = page.getByRole("dialog", { name: "Bienvenido de vuelta" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Correo").fill("admin@taote.pocus");
    await dialog.getByLabel("Contraseña").fill("admin123");
    await dialog.getByRole("button", { name: "Entrar" }).click();
    // Admin nav appears once logged in.
    await expect(page.getByRole("link", { name: "Administrar" })).toBeVisible();
    await expect(page.getByText("ADMIN", { exact: true })).toBeVisible();
  });

  test("non-admin email creates a regular session, no admin nav", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar" }).click();
    const dialog = page.getByRole("dialog", { name: "Bienvenido de vuelta" });
    await dialog.getByLabel("Correo").fill("dr.maria@example.com");
    await dialog.getByLabel("Contraseña").fill("anything");
    await dialog.getByRole("button", { name: "Entrar" }).click();
    // No "Administrar" link; the Salir button is present.
    await expect(page.getByRole("link", { name: "Administrar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
  });

  test("rejects wrong admin password with a clear error", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar" }).click();
    const dialog = page.getByRole("dialog", { name: "Bienvenido de vuelta" });
    await dialog.getByLabel("Correo").fill("admin@taote.pocus");
    await dialog.getByLabel("Contraseña").fill("wrongpass");
    await dialog.getByRole("button", { name: "Entrar" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/Credenciales/);
    await expect(page.getByRole("link", { name: "Administrar" })).toHaveCount(0);
  });
});
