import { expect, test } from "@playwright/test";

// End-to-end coverage of the destructive-flow critical path:
//
//   login admin
//   → "Nuevo caso" → fill title + description → save
//   → case visible on the grid
//   → open modal → "Eliminar" → confirm → soft-delete toast + grid drop
//   → admin route → trash → "Restaurar" → case reappears on the grid
//
// Stops short of "Eliminar permanentemente" because purge is
// terminal (irreversible by design) and the per-id behavior is
// already covered by `useAdminPipeline.test.tsx` at the unit level.
//
// Skips the real-media upload step deliberately. The form accepts
// an empty media field and falls back to the synthetic cine-loop —
// which is what 99 % of test runs exercise. Adding `setInputFiles`
// here would couple the test to a binary fixture in the repo for
// little extra coverage.
//
// Per-test isolation: Playwright's default fresh context per test
// gives us empty localStorage, so no cleanup across the suite.

test.describe("Admin case lifecycle", () => {
  // Reused across the suite: one logged-in admin per file. We don't
  // share state explicitly — each test gets its own browser context —
  // but the steps to reach "logged-in admin viewing the catalog"
  // are the same setup beats every time.
  async function loginAsAdmin(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar" }).click();
    const dialog = page.getByRole("dialog", { name: "Bienvenido de vuelta" });
    await dialog.getByLabel("Correo").fill("admin@taote.pocus");
    await dialog.getByLabel("Contraseña").fill("admin123");
    await dialog.getByRole("button", { name: "Entrar" }).click();
    // Login resolved when the admin chrome appears.
    await expect(page.getByRole("link", { name: "Administrar" })).toBeVisible();
  }

  // The public CaseModal lost its admin action chips in May-2026 —
  // the modal stays read-only chrome (favorite, share, present) and
  // the delete / edit / mark-reviewed flows live in the bulk-edit
  // row ⋮ menu and the Edición tab. This e2e was written against the
  // pre-redesign modal and asserts on a button that no longer
  // exists. Skipped until the test is rewritten against the bulk-
  // edit path; the lifecycle is still covered by unit tests on
  // `useUserCases` (tests/useUserCases.test.tsx + the stability
  // suite). Tracked in the team's TODO.
  test.skip("create → appears on grid → soft-delete → restore from trash", async ({ page }) => {
    await loginAsAdmin(page);

    // ─── 1. Open the new-case form ──────────────────────────────
    // The "Nuevo caso" button is icon-only post-May-2026 (commit
    // f93bee3 / ADR-0009). Match by aria-label since the visible
    // chrome is just "+".
    await page.getByRole("button", { name: "Nuevo caso" }).click();

    // ─── 2. Fill the required fields ─────────────────────────────
    // Required: title + description. Other fields keep their
    // defaults (atlas / cardiac / synthetic cine-loop / current
    // date / "Administrador" as author). Use a unique title with
    // a timestamp suffix so the e2e doesn't collide with a stale
    // case from a previous run that survived in localStorage.
    const uniqueTitle = `E2E Test · Tamponade ${Date.now().toString(36)}`;
    await page.getByLabel("Título").fill(uniqueTitle);
    await page
      .getByLabel("Descripción")
      .fill(
        "Caso generado por el e2e suite — describe un patrón ecocardiográfico de derrame pericárdico con compromiso hemodinámico.",
      );
    await page.getByRole("button", { name: /Publicar caso/ }).click();

    // ─── 3. Verify it lands on the grid ──────────────────────────
    // The form modal closes; the new case mounts in the public
    // grid. We assert by title since ids are auto-generated.
    await expect(page.getByText(uniqueTitle).first()).toBeVisible({ timeout: 10_000 });

    // ─── 4. Open the modal and trigger soft-delete ──────────────
    await page.getByText(uniqueTitle).first().click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: /Eliminar caso/ }).click();
    // The confirm dialog opens (separate <dialog>). Confirm.
    const confirm = page
      .getByRole("dialog")
      .filter({ hasText: /papelera|Eliminar/ })
      .last();
    await confirm.getByRole("button", { name: /Eliminar/ }).click();

    // ─── 5. Toast announces the move; the card disappears ───────
    await expect(page.getByText(/movido a papelera/i)).toBeVisible();
    // After the toast lands the modal closes and the case drops
    // from the public grid.
    await expect(page.getByText(uniqueTitle)).toHaveCount(0);

    // ─── 6. Restore from the admin trash ─────────────────────────
    // The admin trash tab lists user-owned soft-deleted cases.
    await page.getByRole("link", { name: "Administrar" }).click();
    await expect(page).toHaveURL(/\/admin/);
    // Default tab is "Mis casos" which already includes a trash
    // section below the live table. Scroll the case into view via
    // the title locator and hit "Restaurar".
    const trashRow = page.getByText(uniqueTitle).first();
    await trashRow.scrollIntoViewIfNeeded();
    // The trash row sits in a `<tr>` that has its own Restaurar
    // button; ambiguous text matching across the page would catch
    // the live-table row too, so scope to the trash heading area.
    const trashSection = page
      .locator("section,div")
      .filter({ hasText: /Papelera|Trash/ })
      .first();
    await trashSection
      .getByRole("button", { name: /Restaurar/ })
      .first()
      .click();

    // ─── 7. Case reappears on the public catalog ────────────────
    await page.getByRole("link", { name: "Atlas POCUS" }).click();
    await expect(page.getByText(uniqueTitle).first()).toBeVisible({ timeout: 10_000 });
  });
});
