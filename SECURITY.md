# Security policy

## Supported versions

We are pre-1.0. Only `main` is supported. There are no patched older versions to fall back on; security fixes ship as new commits.

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

Email the project lead directly with:

- A description of the vulnerability.
- Steps to reproduce.
- Affected URL or component.
- Your assessment of impact.

Public coordination happens after a fix is in place.

We aim to acknowledge reports within **48 hours** and to ship a fix within **14 days** for high-severity issues.

## Scope

In scope:

- The deployed application (whatever URL the operator publishes — see `NEXT_PUBLIC_SITE_URL`).
- The source code in this repository.
- The CI configuration.

Out of scope (please do not report):

- The intentionally weak demo authentication when Firebase is not configured. The mock auth is documented as bypassable in [ADR-0001](./docs/adr/0001-mock-auth-with-localstorage.md) and the `auth-hint` block in `AuthModal` makes the credentials public on purpose.
- Issues in third-party services we depend on (Firebase, Sentry, Netlify) — report those upstream.
- Anything that requires physical access to a logged-in user's device.
- Issues that only reproduce in unsupported browsers (we target evergreen Chromium, Firefox, Safari).

## Threat model summary

The authoritative model is in the ADRs, but at a glance:

- **`localStorage` backend (default)**: trusts the local browser. The admin role is forgeable from DevTools; this is acknowledged and only acceptable for demos. Real auth (Firebase) closes this.
- **Firebase backend**: admin role is gated by email match against `NEXT_PUBLIC_ADMIN_EMAIL`. Firestore Security Rules enforce server-side. Misconfigured rules are the primary risk.
- **Sentry**: configured with `replaysSessionSampleRate: 0` to avoid leaking case images / diagnoses to a third party. Operators turning on session replay accept that trade-off.

If you find a way around any of this, we want to hear about it.

## Known dependency advisories

`npm audit` flags transitive dependencies of `@lhci/cli` (`uuid`, `tmp`, `external-editor`, `inquirer`). These are CLI-only — they run inside the Lighthouse CI workflow on GitHub-hosted runners and do not ship in the production bundle. The forced fix would downgrade `@lhci/cli` to a non-functional version. We accept the advisories until a clean upgrade is available upstream.

If you find a transitive advisory in a package that **does** ship to the client, that's in scope and we want to know.
