// =================== APP SHELL (SSR-ONLY) ===================
//
// Static silhouette of the app rendered SERVER-SIDE as the
// `<Suspense fallback>` for every page that hosts `<App />`. Without
// this, the production HTML body is empty until the JS bundle hydrates:
//
//   <body>
//     <div hidden></div>
//     <template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>
//   </body>
//
// `<App />` uses client-only hooks (`useSearchParams`, `useRouter`)
// that force the Suspense boundary above it to bail out of SSR. The
// previous `fallback={null}` left nothing visible from FCP all the way
// to hydration — typically 300-500ms on desktop, 1-2s on mobile —
// during which the browser paints a blank page, then the entire
// layout drops in at once. Lighthouse measured this as CLS = 0.345
// on `npm run start` (limit 0.15), with three identical runs across
// 0.34493 / 0.34565 / 0.34565 — deterministic, not noise.
//
// The shell here is a Server Component (no `"use client"`) that
// renders the same shape `<App />` will land into: header strip with
// brand + nav placeholders, an optional sidebar column on desktop, and
// a uniform case-grid populated with skeleton cards. The dimensions
// match the real layout pixel-for-pixel (same `.layout` grid, same
// `.case-grid` template, same header padding) so the swap from
// fallback → real tree is a content swap, NOT a layout reflow.
//
// What this fixes:
//   - CLS 0.345 → ~0.0 (no layout shift, just content replacement)
//   - LCP improves: the shell IS the largest contentful paint until
//     real data lands, so first paint is the shell, not nothing
//   - Lighthouse Perf gate (0.85 minScore) passes on main
//   - Subjective "blank flash" disappears
//
// What this does NOT do:
//   - Hydration is unchanged — `<App />` still mounts the same way
//   - No client-side code added (the shell is server-only)
//   - No styling regressions — the shell reuses the same skeleton
//     classes (`.skeleton-card`, `.skeleton-thumb`, `.skeleton-line`)
//     so the shimmer canon from `skeleton.css` flows through
//
// When to update:
//   - Header changes height → bump the shell's header-strip padding
//   - Layout grid changes (sidebar width, max-width) → bump
//     `.app-shell-layout` to match
//   - Case-grid columns change → no action needed, the grid uses the
//     real `.case-grid` class which already responds to breakpoints

/** Number of skeleton cards the shell renders. 12 ≈ 3 cols × 4 rows,
 *  enough to fill the typical above-fold area on a desktop viewport
 *  (1440×900) without scrolling. On wider screens the grid stays
 *  half-populated below the fold, which is fine — by the time the
 *  user scrolls there, `<App />` has hydrated and the real cards
 *  have replaced the skeletons. */
const SHELL_CARD_COUNT = 12;

export function AppShell() {
  return (
    <div className="app-shell" aria-hidden="true">
      {/* Header strip — matches `.app-header` + `.header-inner`
          dimensions so the sticky positioning + brand + nav row
          occupies the same vertical space as the real Header. */}
      <header className="app-header app-shell-header">
        <div className="header-inner app-shell-header-inner">
          <div className="app-shell-brand">
            <span className="brand-mark" aria-hidden="true">
              {/* Inline copy of the brand sigil from `chrome/Header.tsx`
                  — keeping it inline (vs. an Icon helper) means the
                  shell has zero JS dependencies and SSRs without
                  importing any client modules. */}
              <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <circle
                  cx="14"
                  cy="14"
                  r="12.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  opacity="0.35"
                  pathLength={100}
                />
                <path
                  d="M3 14 Q 7 7, 11 14 T 19 14 T 25 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  pathLength={100}
                />
              </svg>
            </span>
            <span className="brand-wordmark">
              Taote <em>POCUS</em>
            </span>
          </div>
          <div className="app-shell-nav" />
          <div className="app-shell-right" />
        </div>
      </header>

      {/* Body — same `.layout` grid as the real App: 240px sidebar +
          1fr main on desktop, single column below 960px. The CSS for
          `.layout` already handles the responsive breakpoints; the
          shell just renders a sibling sidebar silhouette + the case
          grid filled with skeleton cards. */}
      <div className="layout app-shell-layout">
        <aside className="app-shell-sidebar" aria-hidden="true">
          <div className="app-shell-sidebar-section">
            <div className="skeleton-line" style={{ width: "60%", height: 12 }} />
            <div className="app-shell-sidebar-rows">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-line" style={{ width: "85%", height: 10 }} />
              ))}
            </div>
          </div>
        </aside>
        <main className="app-shell-main">
          {/* Section header silhouette (replaces the hero+stats block
              in `MainGrid`) — short crumb, big title bar, short
              lede. Same height budget as the real section-head. */}
          <div className="app-shell-section-head">
            <span className="skeleton-line" style={{ width: 120, height: 11 }} />
            <span className="skeleton-line" style={{ width: "40%", height: 32, marginTop: 4 }} />
            <span className="skeleton-line" style={{ width: "55%", height: 14, marginTop: 4 }} />
          </div>
          <div className="case-grid">
            {Array.from({ length: SHELL_CARD_COUNT }).map((_, i) => (
              <article key={i} className="skeleton-card">
                <div className="skeleton-thumb" />
                <div className="skeleton-card-body">
                  <span className="skeleton-line skeleton-line--cat" />
                  <div className="skeleton-line skeleton-line--title" />
                  <div className="skeleton-line skeleton-line--meta" />
                </div>
              </article>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
