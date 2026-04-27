# ADR 0002 — URL is the source of truth for view state

- **Status**: Accepted.
- **Date**: 2026-04-27
- **Decider(s)**: Project lead

## Context

The application has a substantial amount of "view state": which section is active, which category and tags filter the grid, the search query, the sort order, which case modal is open, and whether presentation mode is running.

Two patterns are common in React apps:

1. **Local `useState` everywhere.** Simple, but breaks the back button, deep links, and the share feature. The URL stays at `/` regardless of what the user is looking at.
2. **A central store (Redux, Zustand, Context).** Solves the prop-drilling problem but doesn't, by itself, solve the back-button or share-link problem.

A third option — used by GitHub, Linear, and most editorial sites — is to **make the URL the canonical representation of the view**. Changes to filters update the URL; the URL on load determines what the user sees.

## Decision

The URL drives view state. Specifically:

- **Pathname** carries the **view kind**: `/` (Atlas), `/ecg`, `/cases`, `/info`, `/favoritos`, `/admin`. Each is a real Next.js route in `app/`, so each can carry its own `metadata` and is independently statically generated.
- **Search params** carry filters and modal IDs:
  - `?cat=cardiac` — active category
  - `?tags=Crítico,STEMI` — comma-separated active tags
  - `?q=infarto` — search query
  - `?sort=title|featured` (omitted when default `recent`)
  - `?caso=c001` — case modal open
  - `?present=c001` — presentation mode active

Rules:

- The URL is built and parsed by **pure functions** in `lib/url.ts` (`pathToView`, `viewToPath`, `parseViewState`, `applyViewPatch`). No React inside. Unit-tested.
- The React adapter is `hooks/useViewState.ts`. It reads via `usePathname` + `useSearchParams`, writes via `router.push` (for navigations that should add history) or `router.replace` (for filter tweaks that should not pollute history).
- Switching the view kind drops `cat` / `tags` automatically — those are section-specific and would land the user on a likely-empty grid.
- Local `useState` is reserved for **transient** state only: which modal is open _instance_ (not _which case_, that's a URL concern), the toast, the auth modal trigger, hydration flag.

## Consequences

### Pros

- **Back/forward works natively.** Pressing Back closes the modal because the modal opened with `router.push`.
- **Share works for any state.** Pasting `https://…/ecg?cat=cardiac&tags=STEMI` reproduces the exact view.
- **No state-drift bugs.** There is one source. Filter changes don't have to be replicated to a parallel store.
- **Static generation stays viable.** Each top-level path is a separate page, so `/ecg` can ship its own metadata, OG image, and shell HTML.
- **Tests are easy.** `parseViewState` and `applyViewPatch` are tested with `URLSearchParams` — no React, no DOM.

### Cons

- Filter changes trigger a re-render through the router. For the data sizes here it's instant; if the grid grew to thousands of cases this would warrant memoization or a virtualizer.
- Some intermediate states require `router.replace` semantics (don't pollute history), others require `router.push`. The hook exposes both explicitly so callers can pick. The first time you wire a new state it's worth thinking about which one.
- Search params are visible. That's fine for filters, but anything sensitive (e.g. an internal user ID) doesn't belong here. Today no such state exists.

## Alternatives considered

- **Zustand or Redux store.** Would solve prop-drilling but not deep-linking. We'd then need a sync layer between the store and the URL anyway, doubling the surface.
- **React Router v7 / Tanstack Router.** Better URL ergonomics but would conflict with Next's App Router. Not worth it.
- **All search params, single page.** Simpler routing, but loses per-section static metadata and shell HTML, which matters for SEO and OG embeds.
