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
in `lib/`. Each one owns a single named responsibility.

**URL + state plumbing**

| Hook                  | Owns                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `useViewState`        | URL adapter — parses path + search params into `{view, cat, tags, query, sort, ...}`.                                                 |
| `useCardCallbacks`    | Stable per-card bundle (`onCardOpen`, `onCardToggleFav`, `onClearFilters`, `onExploreAtlas`) so `React.memo` on cards short-circuits. |
| `usePersistedState`   | Single seam over `useState` + `lib/store` defensive read/write.                                                                       |
| `usePersistedFilters` | Saved filter combinations (per section) via the persisted-state primitive.                                                            |
| `useSavedViews`       | Named filter snapshots ("my workups", "ECG basics") surfaced in the toolbar.                                                          |
| `useCrossTabSync`     | `storage` event listener so a fav toggle in one tab refreshes the other.                                                              |

**Repo-facing data hooks**

| Hook                    | Owns                                                                         |
| ----------------------- | ---------------------------------------------------------------------------- |
| `useSession`            | Auth state, expiry refresh on focus, login/logout flows.                     |
| `useFavs`               | Favorites set, anonymous-user prompt, persistence via `repo.favs`.           |
| `useUserCases`          | User-uploaded cases (live + trashed), CRUD, optimistic UI, soft-delete.      |
| `useSeedCases`          | Lazy-loads the imported corpus (`lib/imported-cases.ts`) on mount.           |
| `useMergedCatalog`      | Joins seed + user cases + overrides into a single `CaseRecord[]` view.       |
| `useCaseOverrides`      | Per-case admin patches (title/category/etc.) layered over the seed.          |
| `useCaseSaver`          | Form-side write pipeline — validation, optimistic UI, repo dispatch.         |
| `useCatalogConfig`      | Custom categories + section labels (admin-editable).                         |
| `useCatalogDerivations` | Memoized per-category/per-section counts, sorted indices.                    |
| `useRecentlyViewed`     | Most-recent case-id list, capped + deduped, persisted, used by `/favoritos`. |
| `useAdminPipeline`      | Destructive flow orchestration (soft-delete + restore + permanent-delete).   |
| `useAdminActions`       | Bulk patch + bulk soft-delete dispatchers, optimistic UI.                    |

**UI primitives**

| Hook                | Owns                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `useNativeDialog`   | `<dialog>` ref + `showModal()` on mount + `close()` on unmount; `useLayoutEffect`-based to land before paint. |
| `useFocusTrap`      | Tab/Shift+Tab containment inside an open modal; restores focus on unmount.                                    |
| `useModalShortcuts` | Per-modal kbd bindings (`Esc` close, `←/→` navigate cases, `F/S/P` actions).                                  |
| `useSwipeToClose`   | Touch swipe-down dismissal for mobile sheets; desktop no-op.                                                  |
| `useScrollProgress` | Modal read-progress bar value driven by `scrollTop` ratio.                                                    |
| `useHoverPrefetch`  | Background fetches a case's media after 150 ms hover (intent threshold).                                      |
| `useToast`          | Toast queue + auto-dismiss; mirrored in an `aria-live` region.                                                |
| `useShortcuts`      | Global keyboard shortcuts (`?`, `j/k`, `g+letter`); inert while typing.                                       |

**Other**

| Hook                    | Owns                                                                          |
| ----------------------- | ----------------------------------------------------------------------------- |
| `useLanguage`           | i18n context provider + `useT()` translator (see ADR-0013).                   |
| `useFocusDefaults`      | Global / per-section / per-category focus framing for thumbnails.             |
| `useCaseFilters`        | Pure derivation of `{scopedCases, sectionCategories, sectionTags, filtered}`. |
| `useCategoryVisibility` | Admin-toggleable per-category visibility.                                     |
| `useCustomCategories`   | Admin CRUD for non-seed categories.                                           |
| `useHiddenSections`     | Admin-toggleable per-section visibility.                                      |
| `useSectionLabels`      | Admin-editable section label overrides.                                       |
| `useOnlineStatus`       | `navigator.onLine` + `online/offline` events.                                 |
| `useServiceWorker`      | SW registration + update notification.                                        |
| `useAIProvider`         | Provider switcher + key validation for the (optional) AI-assist surfaces.     |

### 8. Components (`components/`)

Organized by responsibility:

- `App.tsx` — the orchestrator (above).
- `MainGrid.tsx` — rendering-branch dispatcher (admin panel / empty
  state / uniform `.case-grid`). Extracted from App so the JSX stays
  composable.
- `Sidebar.tsx` — categories + collapsible tag cloud (used directly by App).
- `SectionHero.tsx` — section-aware hero dispatcher: AtlasHero (stat row +
  featured CTA + sparkline + aurora mesh), EcgHero (animated polyline
  strips), CasesHero (editorial gradient title + lede), InfoHero (poster
  backdrop with scroll-driven parallax). Compact fallback for
  favs/admin/category-narrowed views.
- `EmptyState.tsx` — illustrated per-view empty state (probe, flat ECG,
  open book, folded poster, dashed heart) with optional CTA action.
- `Skeleton.tsx` — typographic placeholders sized to match real content
  silhouettes; rendered while `useSeedCases` is loading the corpus chunk.
- `ErrorBoundary.tsx` — per-region boundary used around grid, featured,
  recently-viewed, and modal surfaces so a single render error doesn't
  blank the entire page.
- `chrome/` — Header (glass on scroll, magnetic nav indicator,
  pathLength-traced wordmark), MobileDrawer, ThemeToggle, Footer
  (editorial colophon), **TransitionLink** (`<Link>` wrapped in
  `document.startViewTransition()` for route morphs), LanguageSwitcher,
  PWAStatus, SavedViewsMenu, ToastHost.
- `cards/` — CaseCard (container-query host), FeaturedRow,
  RecentlyViewedRail (the `/favoritos` "continue where I left off"
  rail), FallbackBadge (the EN→ES fallback marker), AdminThumbMenu (the
  `⋮` quick-actions panel on each card).
  - BentoGrid + QuoteCard were removed in May-2026 (ADR-0009 —
    uniform-catalog-ui); the doc keeps the names here only as a
    breadcrumb for anyone wondering where the atlas landing went.
- `hero/` — CompactHead (shrinks the section hero on scroll; carries
  the `view-transition-name` pairs for route morphs).
- `modals/` — CaseModal, AuthModal, ConfirmDialog, ShortcutsModal,
  CommandPalette (⌘K), ModalLoopMedia (the cine + media-carousel
  inside CaseModal, extracted so the modal stays composable).
- `cine/` — CineLoop, cineScenes (synthetic loops), PresentationMode.
- `admin/` — AdminPanel (the dispatcher), CaseForm + `case-form/`
  sub-tree, BulkEditTable + `bulk-edit/` (tag editor + action bar),
  CategoriesEditor, SectionsEditor, ClassifierBoard + `classifier/`,
  ActivityPanel (recent edits feed), BackupPanel (export/import),
  FocusDefaultsPanel + FocusEditor (per-card thumbnail framing),
  MinePanel (admin's own cases list), and `ai/` (AI-assist provider
  wiring).

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

**Removed (May-2026):** the case-thumb → modal-loop morph on modal
open. A `case-thumb-<id>` name on `<CaseCard>` / `<FeaturedCard>` /
`<RecentlyViewedRail>` matched the same name on `<CaseModal>`'s hero
loop, so the clicked card "grew into" the modal via
`useCardCallbacks.onCardOpen` wrapping the URL state change in
`runWithViewTransition({ instantRoot: true })`. The morph produced a
persistent visual flicker (catalog row briefly visible overlapping the
modal during the transition); four targeted fixes (PRs #75–#78) failed
to fully eliminate it on real devices. PR #79 ripped the wrap out and
PR #80 cleaned up the name plumbing + `vt-root-instant` CSS rules.
The modal now opens via its plain CSS entrance (`.modal` scale-in +
`::backdrop` fadeIn + `dialog[open]` fadeIn). The unit test
`tests/useCardCallbacks.test.tsx` carries a regression guard that
fails if anyone re-introduces the wrap without re-validating the
flicker on real devices.

`lib/view-transition.ts > runWithViewTransition` is kept as the
canonical wrapper (feature detection + `prefers-reduced-motion`
fallback) for whoever wires the next transition. `TransitionLink`
currently calls `document.startViewTransition` inline rather than
through the helper — fine; consolidating is a polish issue, not a
correctness one.

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
  adapters. Coverage threshold ≥ 80% on `lib/`. Regression guards on
  decisions that are easy to silently reopen — e.g.
  `tests/useCardCallbacks.test.tsx` spies on
  `document.startViewTransition` to lock in PR #79's removal of the
  modal-open morph.
- **E2E (Playwright, chromium)**: full flows on the production build —
  navigation, modals, login, deep-links, share. The `e2e/admin.spec.ts`
  suite has a **chronic flake** (~50% pass rate on CI; passes locally)
  whose root cause hasn't been pinned. The current workaround is
  admin-merging affected PRs after green spec-level retries; the
  durable fix is on the backlog. Don't add hand-waved waits to fight
  it — find the real race.
- **Mutation (Stryker)**: configured (`stryker.conf.mjs`) but not yet
  required-on-PR. Useful for spot-checking that tests actually fail
  when the code under test breaks.
- **Lighthouse CI**: `.lighthouserc.json` runs against the prod build,
  enforcing the budgets in `bundle-budget.json`.

CI runs typecheck + lint + format:check + unit tests + build + e2e on
every PR. The admin-spec flake gate is exempt from the strict block.

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
- **Lazy modal mount.** `CaseModal`, `AuthModal`, `CommandPalette`,
  and the admin panel are wrapped in `next/dynamic` with
  `ssr: false`. The modal JS doesn't ship until the user opens
  one — knocks ~40KB gzipped off the initial route.
- **`useHoverPrefetch`.** A 150 ms pointer-enter intent threshold
  on every card kicks off a background fetch of that case's
  media so by the time the user actually clicks the asset is in
  the HTTP cache and the modal mounts paint-ready instead of
  spinner-first.
- **AVIF / WebP image pipeline.** `scripts/optimize-media.mjs`
  pre-encodes a 4-variant ladder (AVIF + WebP at 2 widths) for
  every imported image at build time. Direct `<img srcset>` tags
  win the first paint for above-the-fold thumbnails; Next.js
  Image's optimizer caches the rest. Real saving lands on first
  cache fill per Netlify edge region — see ADR-0006 + the script
  header for the honest framing.

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

- Multi-user concurrency at the same record. The repo facade is
  Firebase-backed (ADR-0004) so two browsers writing to the same case
  no longer "last-write-wins from localStorage" — but there's no
  optimistic-concurrency token yet. A user editing a case while an
  admin retypes the title still ends with whoever-wrote-last winning.
- Real PHI. The admin upload limit and the demo credentials make this
  unsafe for actual patient data; the security disclosure in
  `SECURITY.md` covers what's missing.
- Server-side rendering of dynamic content. Everything is statically
  generated; the URL drives the client. Search engines see the shell,
  not the case grid.
- Languages beyond ES + EN. The i18n layer (ADR-0013) ships ES as the
  canonical write surface and EN as a read-side translation with
  EN→ES fallback marked via `<FallbackBadge>`. Adding a third
  language is a `lib/i18n/dict.<lang>.ts` + the language switcher; no
  structural change needed, but no work has been done.

## Adding a new feature — the cheat sheet

| If you are adding…                    | Touch these files                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A new section (e.g. "Pediatric")      | `lib/data.ts` (SECTIONS) + `lib/url.ts` (VALID_SECTIONS) + new route in `app/`                                            |
| A new field on `CaseRecord`           | `lib/types.ts` + `lib/data.ts` (seed) + `components/admin/CaseForm.tsx` + display where shown                             |
| A new filter                          | `lib/url.ts` (params + applyViewPatch + parseViewState) + `App.tsx` (filtering) + `Sidebar.tsx` (UI)                      |
| A new icon                            | `lib/icons.tsx`                                                                                                           |
| A new persistence backend (Firebase…) | `lib/repo/` only. Tests in `tests/repo.test.ts` already pin the contract.                                                 |
| A new modal                           | `components/modals/` + `useNativeDialog` ref + `useFocusTrap` + open/close via URL or local state                         |
| A new env var                         | `.env.example` + `lib/env.ts` (validation) + reference in code                                                            |
| A new translated string               | `lib/i18n/dict.es.ts` + `lib/i18n/dict.en.ts` (mirrored keys) — `tests/spanish-strings.test.ts` audits hardcoded ES leaks |
| A new admin quick-action              | `components/cards/AdminThumbMenu.tsx` (the per-card `⋮` host) or `components/admin/` (panel-wide)                         |
| A new card-side callback              | `hooks/useCardCallbacks.ts` — keep identity stable so `React.memo(<CaseCard>)` short-circuits                             |

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
