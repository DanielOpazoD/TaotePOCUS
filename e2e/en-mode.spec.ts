import { expect, test, type Page } from "@playwright/test";

// EN-mode tour. The bilingual rollout lands chrome strings in two
// dictionaries (`lib/i18n/dict.{es,en}.ts`); every public surface
// reads through `useT()` so toggling language picks the right slot.
// The two static audits (`public-strings-audit`, `localized-consumer-
// audit`) catch hardcoded literals at compile / lint time, but they
// can't catch shape bugs that only surface at render — e.g., a
// `LocalizedString` accidentally serialized into a template literal
// (the `"[object Object]"` regression caught by user screenshot).
//
// This spec navigates the public surfaces with `?lang=en` and asserts:
//
//   1. Each section H1 matches the EN dict value (regression catches
//      missing dict entries or unwired components).
//   2. EmptyState copy on the empty sections (/cases, /info, /rayos
//      ship 0 cases in the seed corpus) renders the EN strings.
//   3. The body chrome contains zero Spanish marker words — a
//      defensive sweep that catches drift the audits miss (e.g., a
//      future scene-rendered string or a freshly-imported component
//      that wasn't yet routed through `t()`).
//
// We DON'T assert on case content text — imported cases ship with
// only an ES title/description in some entries, and falling back to
// ES is intentional editorial behaviour (the `<FallbackBadge>` flags
// it). Chrome is in scope; content isn't.

// Public surfaces a visitor reads when toggling EN.
const ROUTES: Array<{ path: string; expectedH1: RegExp }> = [
  { path: "/?lang=en", expectedH1: /POCUS Atlas/ },
  { path: "/ecg?lang=en", expectedH1: /^ECG$/ },
  { path: "/cases?lang=en", expectedH1: /Clinical cases/ },
  { path: "/info?lang=en", expectedH1: /Infographics/ },
  { path: "/rayos?lang=en", expectedH1: /Imaging/ },
  { path: "/favoritos?lang=en", expectedH1: /Your collection/ },
];

// Marker words / fragments that, if found in the visible chrome of
// an EN-mode page, indicate a Spanish residue. Kept aligned with the
// `SPANISH_MARKER_WORDS` list in `tests/public-strings-audit.test.ts`
// so the static and runtime checks reinforce each other.
//
// Words that appear in BOTH languages ("ECG", "FAST", "POCUS", and
// the acronyms used in scene labels) are deliberately omitted.
const SPANISH_MARKERS: RegExp[] = [
  /Categoría/,
  /Etiquetas?/,
  /Sección/,
  /Cargando/,
  /Buscar casos/, // search placeholder fragment — distinct enough not to collide with EN "Search"
  /Limpiar filtros/,
  /Mostrando/,
  /Página/,
  /\bAnterior\b/,
  /\bSiguiente\b/,
  /Cerrar caso/,
  /Atajos de teclado/,
  /Aún no has/,
  /Toca el corazón/,
  /Explorar el atlas/,
  /Trazado plano/,
  /Sin historias/,
  /Sin infografías/,
  /Sin estudios/,
  /Sin resultados/,
  /Ninguna radiograf/,
  /Algo no funcionó/,
  /Reintentar/,
  /Detalles técnicos/,
  /Eliminar/,
  /Cancelar/,
];

async function bodyText(page: Page): Promise<string> {
  // Pull the visible chrome only — skip <script>, <style>, hidden
  // elements. Playwright's `innerText` on `body` returns rendered
  // text in document order, respecting `display: none` and ARIA-
  // hidden, which is exactly what a sighted user sees.
  return (await page.locator("body").innerText()).trim();
}

function assertNoSpanishLeak(body: string, path: string) {
  const leaks: string[] = [];
  for (const marker of SPANISH_MARKERS) {
    const m = body.match(marker);
    if (m) leaks.push(`${marker.source} → "${m[0]}"`);
  }
  if (leaks.length > 0) {
    throw new Error(
      `Spanish leak detected in EN-mode chrome on ${path}:\n` +
        leaks.map((l) => `  - ${l}`).join("\n") +
        `\n\nThis means a public-chrome surface skipped the i18n dictionary.\n` +
        `Find the literal in the component tree and route it through useT().`,
    );
  }
}

test.describe("EN-mode public chrome", () => {
  for (const { path, expectedH1 } of ROUTES) {
    test(`${path} renders the EN heading and no Spanish chrome leaks`, async ({ page }) => {
      await page.goto(path);
      // The H1 is rendered by `<SectionHero>` (or page-head equivalent)
      // and reads its value from the dict at render time — a failing
      // assertion here means either a missing EN dict key or a
      // component still wired to the ES baseline.
      await expect(page.getByRole("heading", { level: 1, name: expectedH1 })).toBeVisible();

      // Wait for hydration + seed-cases load so any deferred chrome
      // (the catalog pagination summary, the toolbar filters) is in
      // the DOM before we sweep for Spanish leaks. The home page
      // shows 12+ cards; the empty sections render their EmptyState
      // immediately so a short networkidle is enough.
      await page.waitForLoadState("networkidle");

      const body = await bodyText(page);
      assertNoSpanishLeak(body, path);
    });
  }

  test("empty sections render the EN EmptyState copy", async ({ page }) => {
    // /info, /rayos, /favoritos ship 0 cases in the bundled corpus
    // (seed + imported). The EmptyState is what an EN visitor reads
    // there — this asserts the dict wiring for the per-section
    // title + message pair, which is exactly what the user-reported
    // regression exposed on /rayos + /favoritos.
    //
    // /cases is intentionally OMITTED: `public/data/imported-cases.json`
    // ships 2 cases tagged `section: "cases"`, so the grid renders
    // them instead of the EmptyState. Adding /cases here would force
    // editorial constraints on the imported-cases corpus — keep the
    // audit cleanly orthogonal to content choices.
    //
    // The grid is mounted by `MainGrid`, which only renders its
    // EmptyState branch AFTER the async seed-cases chunk lands.
    // Pin a generous timeout and wait for networkidle so the test
    // isn't flaky on a cold build.
    const cases = [
      { path: "/info?lang=en", title: /No infographics/, body: /No visual references/ },
      { path: "/rayos?lang=en", title: /No studies/, body: /No radiograph or CT/ },
      { path: "/favoritos?lang=en", title: /No saved cases yet/, body: /Tap the heart/ },
    ];
    for (const c of cases) {
      await page.goto(c.path);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: c.title })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(c.body)).toBeVisible();
    }
  });

  test("favoritos empty state offers the EN 'Explore the atlas' CTA", async ({ page }) => {
    await page.goto("/favoritos?lang=en");
    // The button label comes from `MainGrid` resolving
    // `empty.action.exploreAtlas` at render — was hardcoded ES until
    // PR #42 and would have shown "Explorar el atlas" in EN mode.
    await expect(page.getByRole("button", { name: /Explore the atlas/ })).toBeVisible();
  });

  test("shortcuts modal opens with EN labels when '?' is pressed", async ({ page }) => {
    await page.goto("/?lang=en");
    await page.waitForLoadState("networkidle");
    // `useShortcuts` ignores the `?` keypress when focus is in an
    // input — and several public surfaces (the search box, the auth
    // forms when admin) autofocus on mount. Drop focus on the body
    // directly via JS so the global handler runs. We can't `click()`
    // a coordinate because after the May-2026 CaseCard anchor-cover
    // refactor the link's `::after` cover claims the entire card
    // area, and a body-coordinate click can land on a card and
    // trigger `?caso=` instead of the focus drop we wanted.
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      document.body.focus();
    });
    // The shortcuts modal lives off the global `?` keypress. The
    // entire modal — heading, intro, and the 14 shortcut labels —
    // routes through `shortcuts.*` dict keys (PR #42). Open it and
    // assert at least the heading + one representative label.
    await page.keyboard.press("Shift+Slash");
    await expect(page.getByRole("heading", { name: /Keyboard shortcuts/ })).toBeVisible();
    await expect(page.getByText(/Browse and filter without leaving the keyboard/)).toBeVisible();
    await expect(page.getByText(/Show shortcuts/)).toBeVisible();
    // `then` connector between two-key chords (e.g. `g a`). The
    // residue this catches is the `shortcuts.then` dict key never
    // being threaded.
    await expect(page.getByText(/\bthen\b/).first()).toBeVisible();
  });

  test("case modal chrome stays in EN once a card is opened", async ({ page }) => {
    await page.goto("/?lang=en");
    const firstCard = page.locator(".case-card").first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // The close button's aria-label comes from `modal.close.aria` —
    // a residue here would mean someone reverted the existing dict
    // wiring on the modal.
    await expect(page.getByRole("button", { name: /Close case/ })).toBeVisible();
    // Sweep the dialog's own text for Spanish chrome. We DON'T sweep
    // the whole body here (the underlying grid still has Spanish
    // titles for ES-only cases — that's the FallbackBadge case, not
    // a chrome leak).
    const dialogText = await page.getByRole("dialog").innerText();
    assertNoSpanishLeak(dialogText, "/case-modal");
  });
});
