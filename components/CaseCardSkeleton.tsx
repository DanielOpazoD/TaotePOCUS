"use client";

// Placeholder rendered in the catalog grid while the seed-cases
// chunk is still streaming in. Has the SAME outer dimensions as a
// real `<CaseCard>` (1:1 thumb + ~64px of meta below) so the layout
// the user sees during the ~100-500ms hydration window matches the
// post-hydration layout pixel-for-pixel — zero CLS shift when the
// real cards replace the skeletons.
//
// Why not render the cards directly: the seed-cases module is a
// 6055-LOC chunk; it ships in its own code-split bundle and lands
// after first paint. Without this skeleton, the grid was 0px tall
// while loading → footer rendered against the section header →
// chunk lands → grid grows to ~2900px → footer pushed down by
// 2900px → CLS spike. The metric only counts viewport-visible
// shifts but the footer's editorial text is visible at desktop
// widths, and the cumulative effect of card-shuffle during font-
// swap still trips the gate.
//
// Visual: deep-ink thumb (matches `.case-thumb` background) +
// two skeleton-line bars in the meta area. Both the thumb and the
// meta lines carry a 1.6s linear shimmer sweep (`@keyframes
// skeleton-shimmer` — see `app/styles/skeleton.css` and
// `app/styles/cards.css > .case-thumb--skeleton`). The measured
// chunk-load window is 100-500ms on slow networks, plenty for the
// loop to read as deliberate; on fast networks the skeleton
// disappears before the first sweep completes and the user just
// sees a smooth swap. Respects `prefers-reduced-motion`.

export function CaseCardSkeleton() {
  // Inline-style widths/heights migrated to the modifier classes
  // that already existed in `app/styles/skeleton.css` (PR #127 audit
  // cleanup). The previous `style={{ width: "75%", height: 18 }}`
  // pattern was bypassing the design system; the modifier classes
  // are tuned to match the real card's line-heights so the swap is
  // pixel-stable.
  return (
    <div className="case-card case-card--skeleton" aria-hidden="true">
      <div className="case-thumb case-thumb--skeleton" />
      <div className="case-meta">
        <div className="case-cat case-cat--skeleton">
          <span className="skeleton-line skeleton-line--cat" />
        </div>
        <div className="skeleton-line skeleton-line--title" />
        <div className="skeleton-line skeleton-line--meta" />
      </div>
    </div>
  );
}
