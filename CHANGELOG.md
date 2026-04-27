# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Firebase Auth + Firestore backend, feature-flagged.** Six `NEXT_PUBLIC_FIREBASE_*` env vars switch the repo facade from localStorage to Firebase without a code change. Local dev stays on localStorage by default. See [ADR-0004](./docs/adr/0004-firebase-as-primary-persistence.md).
- **Sentry observability, feature-flagged.** `NEXT_PUBLIC_SENTRY_DSN` activates client + server SDKs and source-map upload via `withSentryConfig`. `lib/log.ts` forwards `error` / `warn` to Sentry as captured exceptions, all levels as breadcrumbs. Empty DSN means zero overhead. See [ADR-0005](./docs/adr/0005-observability-with-sentry.md).
- **Netlify deploy config (`netlify.toml`)** with `@netlify/plugin-nextjs`, security headers, and legacy query-param redirects.
- **Lighthouse CI** (`.lighthouserc.json` + `npm run lighthouse`) with budgets enforced on every push to `main`: Performance ≥ 0.85, Accessibility ≥ 0.95, Best Practices ≥ 0.9, SEO ≥ 0.95, CLS ≤ 0.1.
- Project foundation files: `LICENSE`, `CHANGELOG.md`, `.editorconfig`, `.nvmrc`, `.env.example`.
- `docs/ARCHITECTURE.md` and Architecture Decision Records (`docs/adr/`).
- GitHub templates: `pull_request_template.md`, `ISSUE_TEMPLATE/{bug,feature}.md`.
- Typed environment access via `lib/env.ts` — admin credentials configurable via `NEXT_PUBLIC_ADMIN_EMAIL` / `NEXT_PUBLIC_ADMIN_PASSWORD`. Firebase + Sentry config also typed.
- Error hierarchy in `lib/errors.ts`: `AuthError`, `StorageError`, `Result<T,E>`.
- Prettier config + `format` / `format:check` scripts.
- Husky pre-commit hook + `lint-staged` for format/lint/typecheck on staged files.
- Vitest setup file with `matchMedia` / `IntersectionObserver` polyfills.
- Coverage thresholds (≥ 90% statements, ≥ 80% branches in `lib/`).
- Bundle analyzer: `npm run analyze`.
- JSDoc on all public exports of `lib/*` and `hooks/*`.
- Component reorganization by responsibility (`chrome/`, `cards/`, `modals/`, `cine/`, `admin/`).

### Changed

- `lib/repo.ts` is now a dispatcher that selects between localStorage and Firebase backends at boot based on `IS_FIREBASE_ENABLED`.
- CSP in `next.config.mjs` allows connections to `*.googleapis.com`, `*.firebaseio.com`, `*.firebaseapp.com`, `*.sentry.io` so the live SDKs work without unsafe-fallback.
- CI workflow now also runs `format:check` and `test:coverage`; Lighthouse runs on push to `main`.

### Changed

- Routing migrated from query params (`?s=ecg`) to path segments (`/ecg`, `/cases`, `/info`, `/favoritos`, `/admin`). Old URLs no longer apply; share links use the new format.
- Admin sessions expire after 8 h, user sessions after 30 d. Expired sessions auto-clear on next read.
- Case deletion is now soft-delete (audit trail visible in admin trash view) with restore + purge actions.

### Security

- All routes carry `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. HSTS in production builds.
- `next.config.mjs` removes `x-powered-by` header.

## [0.1.0] — 2026-04-26

### Added

- Initial public scaffold: Next.js 16 + App Router, React 18, TypeScript strict.
- Atlas POCUS, ECG, Casos clínicos, Infografías sections.
- Synthetic cine-loops rendered to canvas (12 ultrasound types, 3 ECG patterns, 3 algorithm posters).
- Mock authentication backed by `localStorage`. Admin role gated by hardcoded credentials.
- Admin upload (image / video / GIF) stored as dataURL with 3 MB cap.
- Favorites scoped per user email.
- Modal with cine-loop controls (play/pause, 0.5×/1×/2×).
- Presentation mode (fullscreen + arrow keys + reveal-diagnosis quiz mode).
- Featured row on home with editorial layout.
- Section-specific layouts: ECG strip cards, Casos editorial list, Info posters.
- Dark mode with `prefers-color-scheme` fallback and pre-paint script (no FOUC).
- Hover preview of findings on case cards.
- Accessibility: focus trap on modals, skip-to-content, `aria-live` toast, `prefers-reduced-motion`.
- ErrorBoundary at route + global level.
- Defensive `localStorage` wrapper that surfaces quota errors.
- Vitest unit suite + Playwright e2e suite.
- ESLint flat config.
- Sitemap + robots auto-generated.
