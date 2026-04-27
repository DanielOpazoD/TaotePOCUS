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
- `lib/icons.tsx` — inline SVGs grouped by purpose.
- `lib/log.ts` — single seam for logging. Drop-in for Sentry.
- `lib/env.ts` — typed env access; throws fast if a required var is
  missing in production.
- `lib/errors.ts` — error classes + `Result<T,E>` utility.

### 7. Hooks (`hooks/`)

- `useViewState` — URL adapter for React.
- `useFocusTrap` — modal focus management.

Hooks contain **only React glue**. Anything testable in isolation lives
in `lib/`.

### 8. Components (`components/`)

Organized by responsibility:

- `App.tsx` — the orchestrator (above).
- `Sidebar.tsx` — categories + tag cloud (used directly by App).
- `chrome/` — Header, MobileDrawer, ThemeToggle.
- `cards/` — CaseCard, FeaturedRow.
- `modals/` — CaseModal, AuthModal, ConfirmDialog.
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
no FOUC. CSS lives in `app/globals.css` keyed off the attribute.

### Accessibility

- `role="dialog"` + `aria-modal` + `aria-labelledby` on every modal.
- Focus trap on every modal (`useFocusTrap`).
- Skip-to-content link as the first focusable element.
- Toast announced via `aria-live="polite"` mirror.
- `prefers-reduced-motion` honored both in CSS (transitions/animations)
  and in `CineLoop` (renders one frame instead of looping).
- Visible `:focus-visible` rings.

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
