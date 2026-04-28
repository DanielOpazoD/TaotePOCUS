"use client";

/**
 * Typographic skeletons. Instead of generic gray rectangles, each
 * placeholder mimics the silhouette of the real content — a serif
 * title bar at 30px, a couple of meta strips at 11px, etc. When the
 * actual data lands the swap doesn't shift the page rhythm.
 *
 * Currently unused at runtime (the seed data renders synchronously),
 * but the components are wired and styled so the future Firebase
 * fetch can drop them in without inventing chrome.
 *
 * The shimmer animation respects `prefers-reduced-motion` via the
 * media query in `app/styles/skeleton.css`.
 */

interface SkeletonGridProps {
  /** Number of placeholder cards to render. */
  count?: number;
}

/** Grid of card-shaped skeletons matching the case grid layout. */
export function SkeletonGrid({ count = 6 }: SkeletonGridProps) {
  return (
    <div className="skeleton-grid case-grid" aria-busy="true" aria-label="Cargando casos">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** A single card-shaped skeleton — image area + title line + meta strip. */
export function SkeletonCard() {
  return (
    <article className="skeleton-card" aria-hidden="true">
      <div className="skeleton-thumb" />
      <div className="skeleton-card-body">
        <span className="skeleton-line skeleton-line--cat" />
        <span className="skeleton-line skeleton-line--title" />
        <span className="skeleton-line skeleton-line--title-2" />
        <span className="skeleton-line skeleton-line--meta" />
      </div>
    </article>
  );
}

/** Hero-shaped skeleton — title + subtitle + 3 stat columns. */
export function SkeletonHero() {
  return (
    <header className="skeleton-hero" aria-hidden="true">
      <span className="skeleton-line skeleton-line--crumb" />
      <span className="skeleton-line skeleton-line--h1" />
      <span className="skeleton-line skeleton-line--lede" />
      <div className="skeleton-stats">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <span className="skeleton-line skeleton-line--stat-label" />
            <span className="skeleton-line skeleton-line--stat-value" />
          </div>
        ))}
      </div>
    </header>
  );
}
