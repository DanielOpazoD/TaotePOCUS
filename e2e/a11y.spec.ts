import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Result as AxeResult } from "axe-core";

// Suppress the service worker for the entire a11y suite. The
// Serwist SW (`public/sw.js`) ships with `reloadOnOnline: true`, so
// any transient network blip during the axe scan triggers a tab
// reload mid-evaluate → "Execution context was destroyed". The SW
// also caches navigations, which means cached responses can update
// after axe is injected, again destroying the context.
//
// The unit + chrome behaviour the SW provides is exercised separately
// by `home.spec.ts`. For a11y the SW adds nothing — the rendered DOM
// is identical whether the SW is mounted or not.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Block the API entirely so any code path that calls
    // `navigator.serviceWorker.register(...)` resolves to a no-op
    // and doesn't actually mount the worker.
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      get: () => ({
        register: () => Promise.resolve(undefined),
        ready: new Promise(() => {}),
        controller: null,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  });
});

// Accessibility e2e using axe-core. Two static audits already gate
// chrome strings (`public-strings-audit`, `localized-consumer-
// audit`); the EN-mode tour (`en-mode.spec.ts`) covers language
// switching. What was missing: a runtime check for the things axe
// uniquely catches —
//
//   - color contrast on actual rendered styles (CSS variables +
//     theme + media-state can't be statically analyzed)
//   - landmark / heading hierarchy across the rendered DOM
//   - missing labels on form inputs and interactive controls
//   - duplicate or empty role / aria attributes
//   - ARIA combinations that are individually valid but invalid
//     together (e.g., `aria-hidden` on a focusable element)
//
// Audit policy: fail on `critical` + `serious` violations. The
// `moderate` and `minor` tiers are surfaced in the failure detail
// for visibility but don't block — they're hygiene we want to track,
// not regressions that should turn a PR red. When CI is green, the
// app meets WCAG 2.1 AA for the rules axe ships at those tiers.
//
// Rules currently disabled: none. The previous `nested-interactive`
// entry (focusable `<button class="case-thumb-fav">` inside focusable
// `<div role="button">`) was cleared when CaseCard adopted the
// anchor-cover pattern — the card is now an `<article>` (non-
// focusable) and the open-case action lives on a real `<a>` inside
// the title. Fav and the link are siblings in the focus order, not
// nested.
const DISABLED_RULES: ReadonlyArray<string> = [];

// Routes to scan. The set mirrors `en-mode.spec.ts` so a11y + i18n
// stay aligned: every surface a visitor reaches goes through both
// audits. `/admin` is intentionally out of scope — the admin chrome
// is gated, has a different visual budget, and is exercised in
// `admin.spec.ts` for functional coverage.
const ROUTES = ["/", "/ecg", "/cases", "/info", "/rayos", "/favoritos"];

// Tags to scan. WCAG 2.1 A + AA + best-practice cover everything a
// regulator would expect for a public educational site without
// false-positives from experimental rules. `wcag2aaa` is too strict
// for chrome we don't author (e.g., third-party SDK widgets).
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

// Severity gate. Anything in this set fails the test; the others
// surface in the report but don't error.
const BLOCKING_IMPACTS: ReadonlyArray<string> = ["critical", "serious"];

function formatViolations(violations: ReadonlyArray<AxeResult>): string {
  return violations
    .map((v) => {
      const targets = v.nodes
        .slice(0, 3)
        .map((n) => `      ${JSON.stringify(n.target)}`)
        .join("\n");
      const tail = v.nodes.length > 3 ? `\n      … and ${v.nodes.length - 3} more node(s)` : "";
      return [
        `  ${(v.impact ?? "?").toUpperCase()} · ${v.id}`,
        `    ${v.help}`,
        `    ${v.helpUrl}`,
        `    Nodes:`,
        targets + tail,
      ].join("\n");
    })
    .join("\n\n");
}

test.describe("Accessibility (axe-core)", () => {
  // ES baseline — the locale the catalog ships in by default.
  for (const path of ROUTES) {
    test(`${path} has no serious/critical a11y violations (ES)`, async ({ page }) => {
      await page.goto(path);
      // Settle sequence — pinned down empirically because axe's
      // injected runtime is heavy enough that a still-hydrating
      // page produces "Execution context was destroyed":
      //   1. networkidle — last chance for the seed-cases chunk
      //      and `<Link>` background prefetches.
      //   2. readyState=complete — DOM done parsing.
      //   3. A known content marker per route: either the grid is
      //      hydrated (.case-card present) or the EmptyState rendered.
      //      Pinning to a renderable hook avoids the race where
      //      axe injects mid-hydration.
      //   4. A small buffer for the CineLoop animation rAF + the
      //      service-worker registration to settle.
      await page.waitForLoadState("networkidle");
      await page.waitForFunction(() => document.readyState === "complete");
      await page.locator(".case-grid .case-card, .empty--illustrated").first().waitFor({
        state: "visible",
        timeout: 15_000,
      });
      await page.waitForTimeout(500);

      const results = await new AxeBuilder({ page })
        .withTags(AXE_TAGS)
        .disableRules([...DISABLED_RULES])
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact && BLOCKING_IMPACTS.includes(v.impact),
      );
      const informational = results.violations.filter(
        (v) => !v.impact || !BLOCKING_IMPACTS.includes(v.impact),
      );

      // Surface the informational ones in the test annotation so a
      // green run still shows the lower-tier debt.
      if (informational.length > 0) {
        test.info().annotations.push({
          type: "a11y-info",
          description:
            `${informational.length} non-blocking violation(s):\n` +
            formatViolations(informational),
        });
      }

      expect(
        blocking,
        blocking.length > 0
          ? `axe found ${blocking.length} blocking violation(s) on ${path}:\n\n` +
              formatViolations(blocking)
          : undefined,
      ).toHaveLength(0);
    });
  }

  // EN repeat-pass on `/` only. The chrome translations exercise a
  // different content path (different text content → different role
  // / label resolution), so a clean ES `/` doesn't automatically mean
  // a clean EN `/`. We don't repeat every route — chrome is the same
  // wireframe; one EN smoke is enough to catch translation-induced
  // a11y bugs (e.g., missing aria-label on a switcher that only
  // renders text in one lang).
  test("home renders no serious/critical a11y violations (EN)", async ({ page }) => {
    await page.goto("/?lang=en");
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.readyState === "complete");
    await page.locator(".case-grid .case-card, .empty--illustrated").first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .withTags(AXE_TAGS)
      .disableRules([...DISABLED_RULES])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact && BLOCKING_IMPACTS.includes(v.impact),
    );

    expect(
      blocking,
      blocking.length > 0
        ? `axe found ${blocking.length} blocking violation(s) on /?lang=en:\n\n` +
            formatViolations(blocking)
        : undefined,
    ).toHaveLength(0);
  });

  // Dark mode. Token calibration for dark theme lives in
  // `app/styles/tokens.css` separately from light; a contrast
  // regression in dark-only tokens (e.g. `--ink-mute` on
  // `--surface-2`) wouldn't show up in any of the scans above
  // because they run in the default light theme. `emulateMedia` sets
  // `prefers-color-scheme: dark` BEFORE the goto, so the pre-paint
  // script in `app/layout.tsx` (which reads `localStorage["pocus_theme"]`
  // first, then falls back to the media query) lands on `data-theme=
  // "dark"` and renders the dark token palette from the first paint.
  // Each Playwright context starts with an empty localStorage, so
  // the fallback is what fires.
  test("home renders no serious/critical a11y violations (dark mode)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.readyState === "complete");
    // Sanity check: dark theme actually landed. Without this the
    // test could silently scan light tokens and report a false-pass.
    await expect(page.locator("html[data-theme='dark']")).toBeVisible();
    await page.locator(".case-grid .case-card, .empty--illustrated").first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .withTags(AXE_TAGS)
      .disableRules([...DISABLED_RULES])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact && BLOCKING_IMPACTS.includes(v.impact),
    );

    expect(
      blocking,
      blocking.length > 0
        ? `axe found ${blocking.length} blocking violation(s) on / (dark):\n\n` +
            formatViolations(blocking)
        : undefined,
    ).toHaveLength(0);
  });

  // Mobile viewport. The catalog has CSS branches the desktop scans
  // never exercise: a phone breakpoint hamburger menu in the header,
  // the mobile drawer for category navigation, the full-bleed modal
  // (≤ 640px in `app/styles/modals.css`), and the per-card
  // container-query "compact" layout (≤ 240px). 390×844 is iPhone 13
  // — chosen because it's a realistic target device, NOT the
  // narrowest possible viewport. The mobile drawer pattern is the
  // top regression risk for a11y (focus management + aria-controls).
  test("home renders no serious/critical a11y violations (mobile viewport)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.readyState === "complete");
    await page.locator(".case-grid .case-card, .empty--illustrated").first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .withTags(AXE_TAGS)
      .disableRules([...DISABLED_RULES])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact && BLOCKING_IMPACTS.includes(v.impact),
    );

    expect(
      blocking,
      blocking.length > 0
        ? `axe found ${blocking.length} blocking violation(s) on / (mobile):\n\n` +
            formatViolations(blocking)
        : undefined,
    ).toHaveLength(0);
  });

  // Modal-open state. Dialog accessibility (focus trap, role,
  // aria-modal, labelled-by) is one of the highest-friction
  // surfaces for screen-reader users — and a regression here is
  // invisible from the closed-modal scan.
  test("case modal open state passes a11y on home", async ({ page }) => {
    await page.goto("/");
    // Wait for the grid to hydrate before clicking — without this,
    // the card click can race with the seed-load and trigger a
    // re-render mid-scroll which surfaces as "Execution context
    // destroyed" inside axe.
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.readyState === "complete");
    const firstCard = page.locator(".case-card").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // Give the focus-trap mount + initial render a beat to settle.
    // Without this, axe occasionally scans before the dialog's
    // aria-labelledby resolves to a heading, producing a false-positive
    // "ARIA dialog requires accessible name" violation.
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.readyState === "complete");
    await page.waitForTimeout(750);

    const results = await new AxeBuilder({ page })
      .withTags(AXE_TAGS)
      .disableRules([...DISABLED_RULES])
      // Scope to the native `<dialog>` element (which carries the
      // implicit `role="dialog"`). Using the tag selector rather
      // than the role-attribute selector avoids a flake where the
      // attribute hasn't been computed by the time axe's include-
      // resolver runs.
      .include("dialog")
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact && BLOCKING_IMPACTS.includes(v.impact),
    );

    expect(
      blocking,
      blocking.length > 0
        ? `axe found ${blocking.length} blocking violation(s) inside the case modal:\n\n` +
            formatViolations(blocking)
        : undefined,
    ).toHaveLength(0);
  });

  // Shortcuts modal. Different shape from the case modal — no
  // CineLoop, no scroll-progress bar, just a keyboard-shortcut
  // reference table. Worth a separate scan because the table layout
  // is where heading hierarchy + table-header role bindings can
  // regress invisibly (axe catches those, manual review usually
  // doesn't). Opened via the documented `?` shortcut (`useShortcuts`
  // line 105-111), which routes to `useShortcutsModal > setOpen(true)`.
  test("shortcuts modal open state passes a11y on home", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.readyState === "complete");
    await page.locator(".case-grid .case-card, .empty--illustrated").first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
    // `?` is shift+/; Playwright accepts the resolved character and
    // dispatches it as a `KeyboardEvent` whose `key` is "?", which
    // matches the `case "?"` branch in `useShortcuts`.
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.readyState === "complete");
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .withTags(AXE_TAGS)
      .disableRules([...DISABLED_RULES])
      .include("dialog")
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact && BLOCKING_IMPACTS.includes(v.impact),
    );

    expect(
      blocking,
      blocking.length > 0
        ? `axe found ${blocking.length} blocking violation(s) inside the shortcuts modal:\n\n` +
            formatViolations(blocking)
        : undefined,
    ).toHaveLength(0);
  });
});
