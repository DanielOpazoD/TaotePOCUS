// Skeleton placeholder rendered by Next.js's `dynamic()` loading
// state while the AdminPanel chunk is in flight (see `MainGrid.tsx`).
//
// Why a real skeleton and not `null` (the previous default):
//   - The lazy chunk takes 1-5s to land + parse on a cold cache
//     (real-user RUM showed p75 LCP of 5s on /admin pre-fix).
//   - With a `null` fallback, the page renders empty until the
//     chunk arrives — feels broken on slow networks.
//   - A skeleton reserves the layout space, gives the browser
//     something to paint, and signals "loading" without competing
//     with the eventual LCP element (the skeleton is small in
//     pixel area; the real content's first thumbnail wins).
//
// Visual contract: matches the AdminPanel's outer chrome (status
// row + tab bar + content area) at approximate dimensions, but
// using muted neutral tones so it never reads as "actual content".
//
// Animation: a slow opacity pulse (1.6s loop) rather than a
// horizontal shimmer — restraint-pass aesthetic (the rest of the
// app dropped shimmer in May-2026). Honors `prefers-reduced-motion`.

import { useT } from "@/hooks/useLanguage";

export function AdminPanelSkeleton() {
  const t = useT();
  // `role="status"` + an sr-only label so screen-reader users hear
  // "loading admin panel" instead of just silence. `aria-busy` lets
  // assistive tech know the region is mid-update.
  return (
    <div
      className="admin-panel admin-panel--loading"
      role="status"
      aria-busy="true"
      aria-label={t("admin.loading.aria")}
    >
      {/* Status row (mirrors `.admin-status-row` above the tabs). */}
      <div className="admin-skeleton-row">
        <span className="admin-skeleton-chip" />
        <span className="admin-skeleton-chip" />
      </div>
      {/* Tab bar — 4 tab-width placeholders. */}
      <div className="admin-skeleton-tabs">
        <span className="admin-skeleton-tab" />
        <span className="admin-skeleton-tab" />
        <span className="admin-skeleton-tab" />
        <span className="admin-skeleton-tab" />
      </div>
      {/* Content area — a generic block matching the default tab's
          (Mine panel) approximate vertical extent. Width: full. */}
      <div className="admin-skeleton-content" />
    </div>
  );
}
