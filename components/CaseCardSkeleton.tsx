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
// two skeleton-line bars in the meta area. No animation — the
// chunk lands within a frame or two so a shimmer would only flicker.

export function CaseCardSkeleton() {
  return (
    <div className="case-card case-card--skeleton" aria-hidden="true">
      <div className="case-thumb case-thumb--skeleton" />
      <div className="case-meta">
        <div className="case-cat case-cat--skeleton">
          <span className="skeleton-line" style={{ width: "30%" }} />
        </div>
        <div className="skeleton-line" style={{ width: "75%", height: 18 }} />
        <div className="skeleton-line" style={{ width: "55%", height: 14, marginTop: 6 }} />
      </div>
    </div>
  );
}
