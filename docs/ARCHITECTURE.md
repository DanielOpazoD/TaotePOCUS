# Architecture

This document captures **what** the system is built from, **how** the layers
talk to each other, and **why** the boundaries are where they are. It is
deliberately concise — for the reasoning behind specific decisions, see the
ADRs in [`docs/adr/`](./adr/).

---

## High-level shape

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Next.js App Router                          │
│   /, /ecg, /cases, /info, /favoritos, /admin   robots.ts sitemap.ts │
└──────────────┬──────────────────────────────────────────────────────┘
               │ renders
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          components/App                             │
│        (orchestrator: hydration, modals, lazy-loaded admin)         │
└──┬───────────────┬────────────────┬──────────────────┬──────────────┘
   │ reads         │ writes         │ subscribes       │
   ▼               ▼                ▼                  ▼
URL state     repo facade      hooks (focus,     leaf components
(useViewState) (auth,cases,    URL state,        (cards, modals,
               favs)           reduced motion)   cine, chrome)
                  │
                  ▼
              lib/store
              (defensive localStorage)
                  │
                  ▼
             window.localStorage
```

The graph is intentionally **acyclic and one-directional**. Components never
import store; they go through the repo. The store never imports types from
components. URL parsing has no React dependency.

## Layers, top to bottom

### 1. Routes (`app/`)

Next.js App Router. Each route is a server component that **renders a
single client component (`<App />` wrapped in `<Suspense>`)**. The route's
job is metadata + the suspense boundary. No data fetching here yet — when
real data lands, this is the first place to lift it.

`app/error.tsx` and `app/global-error.tsx` are the route-level and
root-level error boundaries. Any uncaught render error in the tree below
gets a styled fallback with retry.

### 2. App orchestrator (`components/App.tsx`)

The single client component that owns:

- **Hydration**: pulling user / favs / user-cases from the repo on mount.
- **Transient state**: which modal is open, pendingDelete, toast.
- **Wiring**: passes URL-derived state down, wires repo callbacks back up.

It does **not** own filter state. That lives in the URL via `useViewState`.

### 3. URL as source of truth (`lib/url.ts` + `hooks/useViewState.ts`)

Path determines the **view kind** (section / favs / admin). Search params
carry filters (`cat`, `tags`, `q`, `sort`) and modal IDs (`caso`,
`present`).

Why: deep-links, native back/forward, sharing of any filtered state, no
parallel local-state to drift from. ADR-0002 has the longer rationale.

`pathToView` / `viewToPath` / `parseViewState` / `applyViewPatch` are pure
functions — unit-tested in isolation, no React imports.

### 4. Repository facade (`lib/repo.ts`)

The **only** code that talks to the persistence layer. Surfaces three
namespaces — `auth`, `cases`, `favs` — with async signatures so swapping
in a network-backed implementation requires no caller refactor.

Decisions that live here:

- Session expiry (admin 8 h, user 30 d).
- Admin role gating (currently mock; ADR-0001).
- Soft-delete with audit trail (`deletedAt` / `deletedBy`).
- Public `listAll` excludes soft-deleted; admin `listTrashed` surfaces them.

Errors come back as either typed throws (`AuthError`) or `WriteResult`
discriminated unions, depending on whether the failure is _expected_
(quota exceeded) or _exceptional_ (programmer error).

### 5. Defensive store (`lib/store.ts`)

Wraps `localStorage` with:

- Try/catch on every read (corrupted JSON → fallback, never throw).
- Try/catch on every write (returns `WriteResult` instead of throwing).
- Quota detection across browsers (Safari/Firefox/Chrome name codes).
- `estimateUsage()` for the admin panel to surface storage pressure.

The store **does not know about cases or users** — it just persists JSON
under keys. Domain logic lives in `repo`.

### 6. Pure modules (`lib/*`)

- `lib/data.ts` — seed cases, sections, categories, common tags.
- `lib/types.ts` — domain types (`CaseRecord`, `User`, `View`, etc.).
- `lib/headers.ts` — pure: `(view, cat) → { title, sub, crumb }`.
- `lib/icons.tsx` — inline SVGs grouped by purpose. Unified stroke
  grammar (24×24 viewBox, stroke-width 1.5, round caps + joins,
  currentColor).
- `lib/case-meta.ts` — derived case metadata (reading time, difficulty
  label, last-updated tracking).
- `lib/relative-date.ts` — Spanish relative-date formatting
  ("hace 3 días" / "ayer" / "hoy"; falls back to absolute "16 abr 2026"
  beyond ~6 weeks).
- `lib/log.ts` — single seam for logging. Drop-in for Sentry.
- `lib/env.ts` — typed env access; throws fast if a required var is
  missing in production.
- `lib/errors.ts` — error classes + `Result<T,E>` utility.

### 7. Hooks (`hooks/`)

Hooks contain **only React glue**. Anything testable in isolation lives
in `lib/`. Each one owns a single named responsibility:

| Hook              | Owns                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| `useViewState`    | URL adapter — parses path + search params into `{view, cat, tags, query, sort, ...}`.  |
| `useFocusTrap`    | Tab/Shift+Tab containment inside an open modal; restores focus on unmount.             |
| `useFavs`         | Favorites set, anonymous-user prompt, localStorage persistence via `repo.favs`.        |
| `useUserCases`    | User-uploaded cases (live + trashed), CRUD, optimistic UI, soft-delete.                |
| `useSession`      | Auth state, expiry refresh on focus, login/logout flows.                               |
| `useCaseFilters`  | Pure derivation of `{scopedCases, sectionCategories, sectionTags, filtered}` via memo. |
| `useToast`        | Toast queue + auto-dismiss; mirrored in an `aria-live` region.                         |
| `useShortcuts`    | Global keyboard shortcuts (`?`, `j/k`, `g+letter`); binds once on mount.               |
| `useSwipeToClose` | Touch swipe-down dismissal for mobile sheets; pointer events, desktop-disabled.        |
| `useCountUp`      | Integer animates 0 → target via `IntersectionObserver` + RAF; reduced-motion aware.    |

### 8. Components (`components/`)

Organized by responsibility:

- `App.tsx` — the orchestrator (above).
- `Sidebar.tsx` — categories + collapsible tag cloud (used directly by App).
- `SectionHero.tsx` — section-aware hero dispatcher: AtlasHero (stat row +
  featured CTA + sparkline + aurora mesh), EcgHero (animated polyline
  strips), CasesHero (editorial gradient title + lede), InfoHero (poster
  backdrop with scroll-driven parallax). Compact fallback for
  favs/admin/category-narrowed views.
- `EmptyState.tsx` — illustrated per-view empty state (probe, flat ECG,
  open book, folded poster, dashed heart) with optional CTA action.
- `Skeleton.tsx` — typographic placeholders (Card / Grid / Hero) sized to
  match real content silhouettes. Wired but not yet rendered (sync seed).
- `chrome/` — Header (glass on scroll, magnetic nav indicator,
  pathLength-traced wordmark), MobileDrawer, ThemeToggle, **Footer**
  (editorial colophon), **TransitionLink** (`<Link>` wrapped in
  `document.startViewTransition()`).
- `cards/` — CaseCard (container-query host), FeaturedRow, **BentoGrid**
  (atlas landing layout: 2×2 hero + interleaved quote cards), **QuoteCard**
  (no-image variant, serif italic fragment).
- `modals/` — CaseModal, AuthModal, ConfirmDialog, ShortcutsModal.
- `cine/` — CineLoop, cineScenes, PresentationMode.
- `admin/` — AdminPanel, CaseForm.

Each subfolder has a barrel `index.ts` so consumers can write
`import { CaseCard } from '@/components/cards'`. Barrels are intentionally
flat — they re-export, they don't add logic.

## Cross-cutting concerns

### Theming

`<html data-theme="light|dark">` set by a pre-paint script in
`app/layout.tsx`. The script reads `localStorage["pocus_theme"]`,
falls back to `prefers-color-scheme`, runs **before** any CSS so there is
no FOUC. Stylesheets are split into partials in `app/styles/` and
aggregated by `app/globals.css`. All color tokens are **OKLCH** (light +
dark calibrated separately) for perceptually uniform interpolation and
P3 gamut on capable displays.

### Section accent system

Each top-level route gets its own accent color cascading from the layout
container:

- `data-section="atlas"` → `--accent` (cool blue)
- `data-section="ecg"` → `--signal` (green)
- `data-section="cases"` → `--editorial` (warm amber)
- `data-section="info"` → `--poster` (indigo)

Three CSS custom properties (`--section-accent`, `--section-accent-ink`,
`--section-accent-soft`) propagate through every component — case
category labels, the diagnosis box, the modal scroll-progress bar, the
sidebar collapsed-state indicator, the page scrollbar (via `:has()` on
the layout). Changing route changes the entire color narrative without
touching any component.

### Variable fonts + fluid typography

Newsreader is loaded with the `opsz,wght` axes wired up. Token presets
in `tokens.css` (`--serif-display`, `--serif-h1`, `--serif-h2`,
`--serif-h3`, `--serif-body`) tune optical size + weight per usage.

The full typographic scale uses `clamp()` (`--fs-display` through
`--fs-small`) — no media queries for type sizing, ever.

### Container queries

`.case-card` is a `container-type: inline-size` host. Each card decides
its own layout from its own width:

- ≥ 720 px → horizontal "long-read" layout (image left, summary right)
- 380–720 px → standard vertical with bumped title size
- < 240 px → compact (no byline, no tags)

Section-specific section selectors (`.layout[data-section="cases"]`)
add aesthetic touches (dividers, hover colors) but never drive the
responsive logic. The cards are self-sufficient — they look right in
the 3-col grid, the cases 1-col list, the bento 2×2 hero, anywhere.

### View transitions

The `<TransitionLink>` chrome wrapper calls `document.startViewTransition`
around `router.push()` so route changes morph elements with matching
`view-transition-name` instead of cross-fading. Wired today on:

- `hero-h1` / `hero-crumb` — section heros morph to/from the compact head
- `hero-stat-total` / `hero-stat-cats` / `hero-stat-updated` — atlas stats
- `nav-active` — the magnetic nav underline
- `results-count` — the toolbar live count

All wrapped in `@supports (view-transition-name: ...)` — Firefox falls
back to the default Next.js fade. Modifier-clicks and external links
bypass the wrapper so opening in a new tab still works.

### Accessibility

- `role="dialog"` + `aria-modal` + `aria-labelledby` on every modal.
- Focus trap on every modal (`useFocusTrap`).
- Toast announced via `aria-live="polite"` mirror.
- `prefers-reduced-motion` honored throughout — every `animation` and
  every spring/bounce `transition` has a media-query escape. Reviewers
  catch unguarded animations in PR.
- Visible `:focus-visible` rings (custom-tuned in `a11y.css`).
- Keyboard shortcuts: `?` (help), `j/k` (case nav), `g+letter`
  (section jump), `/` (search focus), `←/→` (modal prev/next),
  `F/S/P` (modal favorite/share/present). All shortcuts inert while
  typing in a field.
- The `.kbd-hint` pattern renders shortcut badges next to action
  buttons so power users learn shortcuts in situ.

### Error handling

Three layers of defense:

1. **`lib/errors.ts`** — typed errors. Domain code throws or returns these.
2. **`Result<T,E>`** — for failures that are part of the contract (quota
   exceeded is _expected_ under heavy use). Callers branch on `result.ok`.
3. **`app/error.tsx` + `app/global-error.tsx`** — last resort.

Logging goes through `lib/log.ts`. In dev, prints to console with area
tags. In prod, a no-op until a transport is wired (Sentry / Logtail).

### Testing

- **Unit (Vitest, happy-dom)**: pure modules in `lib/*` and the hook
  adapters. Coverage threshold ≥ 80% on `lib/`.
- **E2E (Playwright, chromium)**: full flows on the production build —
  navigation, modals, login, deep-links, share.

CI runs typecheck + lint + format:check + unit tests + build + e2e on
every PR.

## Performance posture

The catalog shape is "lots of small visual cards in a single grid"
(currently ~330 cases, growing slowly). Two compounding costs:

1. **Layout & paint** — every card has a 1:1 thumbnail wrapper and a
   meta column underneath. The browser pays for laying out and
   painting cards even when they're 5 viewports below the fold.
2. **Animated thumbnails** — the synthetic cine-loops draw to a
   canvas via RAF, and the real-media cards spin up `<video>`
   elements that decode in the background.

The mitigations layered into the codebase:

- **`content-visibility: auto`** on `.case-card` and
  `.classifier-card` (in `app/styles/cards.css` and
  `app/styles/classifier.css`). Off-screen cards skip layout +
  paint entirely; the browser uses `contain-intrinsic-size` as a
  scrollbar-stable placeholder. This is the cheapest fix and
  catches the largest cost.
- **IntersectionObserver gating in `<CineLoop>`** (in
  `components/cine/CineLoop.tsx`). The RAF is paused for any cine
  whose wrapper isn't intersecting the viewport (with a 200px
  rootMargin). Off-screen cards therefore mount their canvas /
  video element but don't burn CPU on it.
- **`prefers-reduced-motion`** opt-out in CineLoop. Users with the
  OS setting see one frame and stop — zero ongoing render cost
  for a percentage of the audience.
- **Code-split corpus.** `lib/imported-cases.ts` (the 326-case
  dataset) is loaded via dynamic `import()` in `lib/seed-cases.ts`,
  so the initial bundle stays small (see ADR-0006 / the size
  budget script in `scripts/bundle-budget.mjs`).

What this DOES NOT solve, by design:

- **The full React tree still mounts.** `content-visibility` is a
  paint optimization, not a JS one. If the card count grows past
  ~1000, mounting cost (per-card `useEffect`s, IO observers,
  etc.) becomes the next bottleneck. The fix at that scale is
  proper virtualization (`react-window` or similar). Not done yet
  because:
  - The current count + the paint optimization above keep first
    interactive well under 1.5 s on a mid-tier phone in the
    Lighthouse runs the team owns.
  - The grid has container queries that flip the card layout based
    on its container width (the cases section's long-read flip).
    A fixed-height row virtualizer would conflict with that;
    proper measurement-based virtualization is a chunk of work
    we'd rather spend once we've outgrown the paint optimization.
- **No request-level pagination on the public grid.** The repo
  facade exposes `listAllPaged` (used by the imported corpus
  loader), but the homepage renders `listAll` and lets the browser
  skip-render. When the catalog grows past a few thousand cases
  the trade-off flips and pagination becomes mandatory.

## What this codebase is **not** prepared for

These are deliberate non-goals at this stage. Each one becomes a real
concern when we move to a backend, and is tracked in an ADR or in
`README.md`.

- Multi-user concurrency. `localStorage` is a single-tab store; two tabs
  edit the same case → last write wins.
- Real PHI. The admin upload limit and the demo credentials make this
  unsafe for actual patient data.
- Server-side rendering of dynamic content. Everything is statically
  generated; the URL drives the client. Search engines see the shell,
  not the case grid.
- Internationalization. Everything is in Spanish. The structure is
  translation-ready (no hardcoded strings outside views), but no
  dictionary layer yet.

## Adding a new feature — the cheat sheet

| If you are adding…                    | Touch these files                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A new section (e.g. "Pediatric")      | `lib/data.ts` (SECTIONS) + `lib/url.ts` (VALID_SECTIONS) + new route in `app/`                       |
| A new field on `CaseRecord`           | `lib/types.ts` + `lib/data.ts` (seed) + `components/admin/CaseForm.tsx` + display where shown        |
| A new filter                          | `lib/url.ts` (params + applyViewPatch + parseViewState) + `App.tsx` (filtering) + `Sidebar.tsx` (UI) |
| A new icon                            | `lib/icons.tsx`                                                                                      |
| A new persistence backend (Firebase…) | `lib/repo.ts` only. Tests in `tests/repo.test.ts` already pin the contract.                          |
| A new modal                           | `components/modals/` + add a `useFocusTrap` + open/close via URL or local state                      |
| A new env var                         | `.env.example` + `lib/env.ts` (validation) + reference in code                                       |

## Companion docs

- [`PERSISTENCE.md`](./PERSISTENCE.md) — where each table / cache
  lives at runtime, the read/write paths through the repo facade,
  and the staged migration (Stage 1 → Stage 4) referenced
  throughout `lib/repo*`. Read this before touching anything in
  `lib/repo/` or `app/actions/db.ts`.
- [`DATA-MODEL.md`](./DATA-MODEL.md) — `CaseRecord` shape with the
  bits the TypeScript types can't fully describe (canonical vs
  deprecated body fields, override map, lifecycle flags, focus
  framing). Read this before adding a field to the case shape.
- [`adr/`](./adr/) — indexed decision log. Read the relevant ADR
  before changing a behavior the ADR describes — and write a new
  ADR if the change is non-obvious or hard to bisect later.
