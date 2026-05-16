import { expect, test, type Page } from "@playwright/test";

/**
 * Navigate to `path` AND wait for React hydration to attach event
 * handlers. SSR-painted buttons (header "Entrar", nav links) are
 * visible immediately but their onClick handlers only wire up once
 * the client bundle hydrates — which on a CI runner under load can
 * lag the visible paint by 100–300ms.
 *
 * Playwright's `click()` already auto-waits for "visible + stable",
 * but stability says nothing about whether JS has attached. Without
 * an explicit gate, headless Chromium occasionally fires the click
 * into a no-op hole and the test then times out waiting for the
 * downstream effect (e.g. the AuthModal failing to open).
 *
 * The marker is set by an empty-deps `useEffect` in `<AppInner>` —
 * React commits before effects run, so by the time the attribute
 * flips every onClick on the page is wired.
 */
async function gotoHydrated(page: Page, path: string) {
  await page.goto(path);
  await page.locator("body[data-app-hydrated='1']").waitFor({ timeout: 10_000 });
}

test.describe("Admin flow", () => {
  test("admin can log in and reach the panel", async ({ page }) => {
    await gotoHydrated(page, "/");
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
    await gotoHydrated(page, "/");
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
    await gotoHydrated(page, "/");
    await page.getByRole("button", { name: "Entrar" }).click();
    const dialog = page.getByRole("dialog", { name: "Bienvenido de vuelta" });
    await dialog.getByLabel("Correo").fill("admin@taote.pocus");
    await dialog.getByLabel("Contraseña").fill("wrongpass");
    await dialog.getByRole("button", { name: "Entrar" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/Credenciales/);
    await expect(page.getByRole("link", { name: "Administrar" })).toHaveCount(0);
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
    await gotoHydrated(page, "/");

    // 1. Login as admin
    await page.getByRole("button", { name: "Entrar" }).click();
    const dialog = page.getByRole("dialog", { name: "Bienvenido de vuelta" });
    await dialog.getByLabel("Correo").fill("admin@taote.pocus");
    await dialog.getByLabel("Contraseña").fill("admin123");
    await dialog.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("link", { name: "Administrar" })).toBeVisible();

    // 2. Navigate to /admin
    await page.getByRole("link", { name: "Administrar" }).click();
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
