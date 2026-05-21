// Imperative chunk warmup for the lazy-loaded `AdminPanel`.
//
// `AdminPanel` is `dynamic(() => import("./AdminPanel"), { ssr: false })`
// in `MainGrid.tsx` so it never lands in public-route bundles. The
// downside: when an admin user clicks the gear icon, the click is
// the first thing that asks for the chunk, and the network +
// parse + hydrate sequence shows up as ~5s of LCP on `/admin`
// (real-user RUM, May-2026).
//
// This helper lets the header pre-warm the chunk on hover / focus
// of the admin link — so by the time the click happens the bundle
// is mostly in the HTTP cache and the AdminPanel paints almost
// immediately. Webpack/Next dedupe with the `dynamic()` import call,
// so there's no double-fetch.
//
// Mobile users (no hover) still see the in-flight chunk skeleton
// (see `AdminPanelSkeleton`) but pay the cold cost on first visit.

export function preloadAdminPanel(): void {
  // `void` discards the promise — we're calling for the side effect
  // (kick off the network request); the chunk's loader manages the
  // result. If the import fails the AdminPanel render will fail too,
  // and that error path is already covered by `<ErrorBoundary>` in
  // the parent tree.
  void import("./AdminPanel");
}
