// Next.js convention: this file becomes the loading UI for the root
// route + every nested segment that doesn't define its own
// `loading.tsx`. Crucially — unlike a `<Suspense fallback>` in
// `page.tsx` — `loading.tsx` IS rendered into the static HTML at
// build time, so the browser paints it on first contentful paint
// even before any JS executes.
//
// Why this exists (May-2026): every page in the app hosts `<App />`
// which uses client-only hooks (`useSearchParams`, `useRouter`).
// Those hooks force the page's Suspense boundary to bail out of SSR
// with a `BAILOUT_TO_CLIENT_SIDE_RENDERING` marker — the body emits
// an empty Suspense placeholder, no fallback HTML, and the entire
// layout drops in only once the JS bundle hydrates. Lighthouse on
// `npm run start` measured CLS = 0.345 deterministically across
// three runs (limit 0.15), Perf score 0.77 (limit 0.85).
//
// `loading.tsx` sidesteps the bailout entirely: Next.js renders this
// component server-side at build time, so the static HTML body
// contains the shell silhouette. When the route hydrates and
// `<App />` mounts, the shell is replaced — same dimensions, no
// layout shift. Expected impact:
//   CLS: 0.345 → ~0 (no first paint → fallback shift)
//   Perf: 0.77 → 0.90+ (the shell IS the largest contentful paint
//                       until real data lands)
//   FCP: improves materially (browser paints the shell immediately
//        instead of waiting for JS parse → fallback render)
//
// See `components/AppShell.tsx` for the shell markup and the
// rationale for which dimensions matter.

import { AppShell } from "@/components/AppShell";

export default function Loading() {
  return <AppShell />;
}
