import { expect, test } from "@playwright/test";

// Helper: open the avatar UserMenu so the "Administrar" / "Salir" rows
// are exposed. Centralised because every admin assertion below depends
// on it — the UserMenu refactor (PR #117) moved every admin nav action
// behind the avatar dropdown, so tests can no longer expect them at
// the top level.
async function openUserMenu(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Abrir menú de la cuenta/ }).click();
}

test.describe("Admin flow", () => {
  test("admin can log in and reach the panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar" }).click();
    const dialog = page.getByRole("dialog", { name: "Bienvenido de vuelta" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Correo").fill("admin@taote.pocus");
    await dialog.getByLabel("Contraseña").fill("admin123");
    await dialog.getByRole("button", { name: "Entrar" }).click();
    // Admin signal at the top level: the "+New case" button only
    // renders when `isAdmin === true` (Header.tsx). Doesn't require
    // opening a dropdown — fastest possible admin-state check.
    await expect(page.getByRole("button", { name: "Nuevo caso" })).toBeVisible();
    // The Administrar link itself lives inside the UserMenu dropdown
    // since the May-2026 UserMenu refactor (PR #117) — open the menu
    // first so the link is in the visible tree.
    await openUserMenu(page);
    await expect(page.getByRole("menuitem", { name: "Administrar" })).toBeVisible();
  });

  test("non-admin email creates a regular session, no admin nav", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar" }).click();
    const dialog = page.getByRole("dialog", { name: "Bienvenido de vuelta" });
    await dialog.getByLabel("Correo").fill("dr.maria@example.com");
    await dialog.getByLabel("Contraseña").fill("anything");
    await dialog.getByRole("button", { name: "Entrar" }).click();
    // No top-level "+New case" button (admin-only).
    await expect(page.getByRole("button", { name: "Nuevo caso" })).toHaveCount(0);
    // Open UserMenu: Salir is present but Administrar is not (non-admin).
    await openUserMenu(page);
    await expect(page.getByRole("menuitem", { name: "Salir" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Administrar" })).toHaveCount(0);
  });

  test("rejects wrong admin password with a clear error", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar" }).click();
    const dialog = page.getByRole("dialog", { name: "Bienvenido de vuelta" });
    await dialog.getByLabel("Correo").fill("admin@taote.pocus");
    await dialog.getByLabel("Contraseña").fill("wrongpass");
    await dialog.getByRole("button", { name: "Entrar" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/Credenciales/);
    // No admin state change: the +New case button stays absent.
    await expect(page.getByRole("button", { name: "Nuevo caso" })).toHaveCount(0);
  });

  // ─── End-to-end smoke ───────────────────────────────────────────
  // Walks the principal admin flow once, top-to-bottom, against a
  // booted dev server. Catches regressions where individual unit
  // tests pass but the wiring breaks (e.g. routing, lazy-loaded
  // tabs, props not threaded through MainGrid). Lives in this file
  // so `npm run test:e2e -- admin` is the single command.
  //
  // Scope: login → tab routing inside AdminPanel → Backup export
  // pre-flight summary. Stops short of actually firing a download
  // (Playwright's download API works but adds artifacts to clean up
  // for what's already covered by `BackupPanel.test.tsx`).
  test("admin smoke — login, tab routing, Backup pre-flight visible", async ({ page }) => {
    await page.goto("/");

    // 1. Login as admin
    await page.getByRole("button", { name: "Entrar" }).click();
    const dialog = page.getByRole("dialog", { name: "Bienvenido de vuelta" });
    await dialog.getByLabel("Correo").fill("admin@taote.pocus");
    await dialog.getByLabel("Contraseña").fill("admin123");
    await dialog.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("button", { name: "Nuevo caso" })).toBeVisible();

    // 2. Navigate to /admin via the UserMenu's Administrar row.
    await openUserMenu(page);
    await page.getByRole("menuitem", { name: "Administrar" }).click();
    await expect(page).toHaveURL(/\/admin/);

    // 3. Default tab is "Mis casos" — the stats grid is its
    // distinguishing feature.
    await expect(page.getByText("Casos totales").first()).toBeVisible();

    // 4. The Backup tab is always present and switches the subtree.
    await page.getByRole("tab", { name: "Backup" }).click();
    await expect(page.getByRole("heading", { name: "Backup", level: 2 })).toBeVisible();
    // Pre-flight summary buckets render. Each label appears in two
    // places (the "Exportá un archivo JSON con…" intro paragraph and
    // each `<li>` entry on the summary list); narrow with `.first()`
    // so strict-mode doesn't flag the dual match.
    await expect(page.getByText("reclasificaciones").first()).toBeVisible();
    await expect(page.getByText("favoritos").first()).toBeVisible();
    await expect(page.getByText("casos propios").first()).toBeVisible();
    await expect(page.getByText("categorías personalizadas").first()).toBeVisible();

    // 5. Export button is present and enabled — proves the panel
    // wiring resolved a non-zero env state without crashing.
    await expect(page.getByRole("button", { name: /Exportar backup/i })).toBeEnabled();
  });
});
