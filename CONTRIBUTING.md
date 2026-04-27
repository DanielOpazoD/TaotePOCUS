# Contributing

Welcome. This file is the operational manual: how the codebase is structured, the bar for changes, and how to ship without breaking the conventions.

For the **why** of each decision, see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and the [ADRs](./docs/adr/).

---

## TL;DR

```bash
git clone <repo>
cd taote-pocus
nvm use            # picks the version from .nvmrc (Node 20)
npm install
npm run dev        # http://localhost:3000

# Before pushing:
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run test:e2e
```

The pre-commit hook runs `lint-staged` (Prettier + ESLint --fix on staged files). CI runs the full gauntlet on every PR.

---

## Before you start

1. **Read the ADRs.** Even if your change feels small, knowing why the URL is the source of truth or why the repo facade exists prevents working against the architecture.
2. **Ask first if you're unsure.** Open an issue with the [feature template](./.github/ISSUE_TEMPLATE/feature.md) for anything that crosses a layer boundary or adds a dependency. Most "I'll just refactor X" ideas turn into bigger questions.
3. **Pin scope.** A PR that touches files outside its stated purpose gets sent back. Keep them small.

---

## Conventions

### Code language

- **Identifiers** in English (`cases`, `userMessage`, `pendingDelete`).
- **UI strings** in Spanish (`"Casos clínicos"`, `"Cerrar caso"`).
- **Comments** in English so the codebase stays readable without context.

### TypeScript

- `strict: true`. No exceptions.
- Prefer `unknown` over `any` and narrow with type guards.
- Discriminated unions for state shapes (`View`, `WriteResult`, `Result<T, E>`).
- Use `interface` for object shapes, `type` for unions and aliases.
- Don't widen types for convenience — if a function takes a `CategoryId`, don't accept `string` "for flexibility".

### Errors

Two patterns, picked at the call site:

- **`Result<T, E>`** for failures that are part of the contract. The classic example is a write that may hit the localStorage quota — the caller decides whether to retry or surface a toast.
- **Typed `throw`** for failures that are exceptional. `AuthError` is the one we use.

If you find yourself wrapping every call in `try/catch`, the call should probably return `Result` instead.

### State

- The URL is the source of truth for view state. Filters, sort, the open modal — all in search params (see [ADR-0002](./docs/adr/0002-url-driven-state.md)).
- `useState` only for transient UI state (auth modal trigger, drawer open, hydration flag, toast). When in doubt, ask: "should pasting this URL reproduce the state?"
- Cross-component state lives in a hook (`hooks/use*.ts`). No context yet — we haven't needed it.

### Persistence

- All persistence goes through `repo.*` (`lib/repo.ts`). Components do not import `lib/store.ts` or `firebase/*` directly.
- New persisted shapes get a type in `lib/types.ts` and a Vitest test under `tests/repo.test.ts`.

### Logging

- Use `log.{debug,info,warn,error}` from `@/lib/log`. Tag with `area`.
- Don't `console.log` in committed code. ESLint won't catch it; reviewers will.
- Errors caught from external code go through `log.error(message, ctx, error)` so Sentry sees the original exception.

### Styles

- Single CSS file at `app/globals.css`. Sectioned by `=================== HEADER ===================` banners — find your section before adding new rules.
- Use the design tokens at the top of the file (`--space-*`, `--duration-*`, `--ease-*`, `--radius-*`). New magic numbers get pushed back in review.
- Tema oscuro is `[data-theme="dark"]` only — no `@media (prefers-color-scheme)` blocks. The pre-paint script handles the OS default.
- Respect `prefers-reduced-motion` — if you add an animation, check it ends correctly when motion is off.

### Components

Organized by responsibility. Pick the right folder when adding a new component:

- `components/chrome/` — top-of-page chrome (header, mobile drawer, theme toggle).
- `components/cards/` — case cards in any layout (grid, featured row, editorial list).
- `components/modals/` — overlays. Every modal uses `useFocusTrap` and the `role="dialog" aria-modal aria-labelledby` triad.
- `components/cine/` — synthetic cine-loop renderer + presentation mode.
- `components/admin/` — admin-only views (lazy-loaded by `App.tsx`).
- Root: `App.tsx` (orchestrator) and `Sidebar.tsx` (used directly by App).

### Accessibility

- Every interactive element is keyboard-reachable.
- Modals trap focus and restore on close.
- Use `<button>` for actions, `<a>` for navigation. Never `<a onClick>` without `href`.
- Form fields associate their label (`<label htmlFor>`).
- Live status (toast) gets an `aria-live="polite"` mirror.
- Test: open the page, press Tab repeatedly, verify the order makes sense and nothing is unreachable.

---

## Commit messages

Conventional commits, briefly:

```
type(scope): short imperative description

Optional longer body — what and why, not how.
Bullet points OK.
```

Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `style`, `perf`, `build`, `ci`. Scope is optional but useful (`feat(admin): ...`, `fix(auth): ...`).

The commit body matters when the change is non-trivial — diffs answer "what", commits answer "why".

---

## Pull requests

The [PR template](./.github/pull_request_template.md) walks through the boxes. Please fill them. Anything not on the list:

- **No drive-by changes.** If you spot something else that needs fixing, open an issue.
- **CI must be green.** Yes, even on docs PRs (the format check catches markdown issues).
- **No unannotated `any`** — if you must, leave a `// FIXME(...)` and an issue link.

Reviewers will read your description first. If a reviewer can't understand what changed without reading the diff, the description needs work.

---

## Releasing

We're pre-1.0. The `CHANGELOG.md` `[Unreleased]` section is the running log. When we cut a release:

1. Move the `[Unreleased]` block under a new `[X.Y.Z] — YYYY-MM-DD` header.
2. Bump `version` in `package.json`.
3. Tag the commit `vX.Y.Z`.
4. The Lighthouse CI job runs on push to `main`; the report URL appears in the action log.

Semver, with the usual interpretation for a public-facing app:

- **Major** — breaking change to the URL scheme, the auth flow, or what an existing favorite/case looks like.
- **Minor** — new feature, route, or section.
- **Patch** — bug fix, content addition, copy change.

---

## Reporting issues

Use the issue templates (`bug` / `feature`) — they ask for the right context. If something might be a security problem, **don't open a public issue** — see [`SECURITY.md`](./SECURITY.md).
