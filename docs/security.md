# Security posture — Taote POCUS

This document is the security audit trail for the codebase. It
exists so that:

1. **Future contributors** can understand the threat model without
   reverse-engineering it from headers + middleware.
2. **External reviewers** can verify the posture without reading
   every config file.
3. **Incident response** has a documented baseline to compare
   against when something looks off in production.

Last revised: **2026-05-21** (initial commit in PR #125).

---

## 1. Threat model

**Asset inventory** — what we're protecting:

| Asset                                      | Sensitivity | Where it lives                                                                                         |
| ------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------ |
| Case content (titles, descriptions, media) | Public      | Static JSON + Netlify Blobs                                                                            |
| User favorites / preferences               | Per-user    | `localStorage` (browser)                                                                               |
| User session (Clerk JWT)                   | High        | Clerk cookies (httpOnly, SameSite=Lax)                                                                 |
| Admin role flag                            | High        | Server-derived from session; never trusted from client                                                 |
| RUM event stream                           | Low         | Netlify Blobs (`web-vitals` namespace)                                                                 |
| AI provider keys (DeepSeek)                | High        | Server env only (`process.env`); never sent to client                                                  |
| Sentry DSN                                 | Public-ish  | Bundled in client; **only the hostname** surfaces in `/api/admin/observability` (project key stripped) |

**Threat actors** — who we're defending against:

| Actor                                                 | Capability                                     | Mitigation                                                                                                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Passive net observer**                              | Read traffic on a shared network               | TLS-only via HSTS + `Strict-Transport-Security: preload`                                                                                                                                                                |
| **Hostile script** (injected via XSS)                 | Run JS in the user's context                   | CSP `script-src 'self' ...` (no `unsafe-eval`); React's default escaping; allow-listed image / connect sources                                                                                                          |
| **Malicious site embedding ours**                     | Click-jack / open in iframe                    | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`                                                                                                                                                                  |
| **Compromised third-party** (Clerk, Sentry, DeepSeek) | Inject malicious payload via legitimate origin | Allow-listed CSP, SRI _not_ applied (third parties version their bundles; SRI would break on rollouts). Sentry is sandboxed: only DSN exposure documented above.                                                        |
| **Tampered client beacon**                            | Spam RUM ingest with garbage                   | Allow-list of valid tag names + length caps in `app/api/metrics/report/route.ts`. Invalid payloads silently dropped at the validator. No auth required (anyone can beacon), but data is bucketed (no user attribution). |
| **Admin endpoint poking**                             | Discover admin-only routes                     | Every `/api/admin/*` route calls `requireAdmin()` → 403 on missing or non-admin session. Verified manually for each route (see audit table below).                                                                      |
| **Local malicious user** (shared computer)            | Read another user's localStorage               | Out of scope — same-device same-browser is the implicit trust boundary for `localStorage`                                                                                                                               |

**Out of scope** (explicit non-defenses):

- **Active MITM attacks on the user's network**: TLS handles this; we don't pin certificates.
- **Compromised end-user device**: malware / keyloggers can read anything. Standard browser sandbox is the trust boundary.
- **Account takeover via reused password**: handled by Clerk's auth surface, not by this codebase.

---

## 2. Security headers (status: enforced)

Set in two places and kept in sync: `next.config.mjs:securityHeaders` (applied to every Next response) + `netlify.toml:[[headers]]` (applied at the CDN layer, including static assets the Next plugin doesn't see).

| Header                         | Value                                                          | Rationale                                                                         |
| ------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `Content-Security-Policy`      | See `next.config.mjs`                                          | Allow-listed; no `unsafe-eval`; `unsafe-inline` only for Next/theme bootstrappers |
| `X-Frame-Options`              | `DENY`                                                         | Belt-and-suspenders with CSP `frame-ancestors 'none'`                             |
| `X-Content-Type-Options`       | `nosniff`                                                      | No MIME confusion                                                                 |
| `Referrer-Policy`              | `strict-origin-when-cross-origin`                              | Don't leak paths to third parties                                                 |
| `Permissions-Policy`           | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | No FLoC, no device permissions                                                    |
| `Strict-Transport-Security`    | `max-age=63072000; includeSubDomains; preload`                 | HSTS, applied only in production                                                  |
| `Cross-Origin-Opener-Policy`   | `same-origin-allow-popups`                                     | Strict isolation, except for Clerk SSO popups                                     |
| `Cross-Origin-Resource-Policy` | `same-origin`                                                  | No cross-origin reads of our resources                                            |

**Verification**: `scripts/verify-security-headers.mjs` (run manually against the deployed URL, also recommended as a Netlify post-deploy check).

---

## 3. CSP violation reporting

CSP includes `report-uri /api/security/csp-report` so violations surface in Sentry instead of failing silently. Reports include:

- The directive that was violated
- The source URL of the offending resource
- The disposition (`enforce` vs `report-only`)

**Important**: the endpoint is allowed to receive POSTs without auth (browsers can't authenticate when sending CSP reports). Validated server-side: payload size cap, JSON shape, allow-list of `effective-directive` values to ignore noise from extensions.

---

## 4. Auth & authorisation surface

| Route                            | Auth required     | Admin required | Check location                                                  |
| -------------------------------- | ----------------- | -------------- | --------------------------------------------------------------- |
| `GET /api/health`                | No                | No             | Status-check ping                                               |
| `POST /api/metrics/report`       | No                | No             | Public beacon — see threat actor "tampered client beacon" above |
| `POST /api/security/csp-report`  | No                | No             | Browser-sent, validated by shape                                |
| `GET /api/admin/observability`   | Yes               | Yes            | `requireAdmin()`                                                |
| `GET /api/admin/metrics`         | Yes               | Yes            | `requireAdmin()`                                                |
| `GET /api/admin/ai/providers`    | Yes               | Yes            | `requireAdmin()`                                                |
| `POST /api/admin/ai/*`           | Yes               | Yes            | `requireAdmin()`                                                |
| `/api/media/[id]`                | No                | No             | Public catalog content; no PII surfaces                         |
| Server Actions (cases, settings) | Yes (via cookies) | Per-action     | Cookie-based session, verified server-side per call             |

The `requireAuth` and `requireAdmin` helpers live in `lib/server/session.ts` and are the **only** correct way to check authentication server-side. Bypassing them (e.g. reading the session cookie manually) skips the role check and is forbidden.

---

## 5. Secrets management

- **Server-only secrets** (`DEEPSEEK_API_KEY`, `CLERK_SECRET_KEY`, `SENTRY_AUTH_TOKEN`): set in Netlify env vars, accessed via `process.env.*` server-side. Never imported into client modules.
- **Build-time only secrets** (`SENTRY_AUTH_TOKEN` for sourcemap upload): used in CI/build, not at runtime.
- **Client-side public values** (`NEXT_PUBLIC_*`): bundled into the client; assume they're public.
- **Pre-commit guardrail** (`.husky/pre-commit`): runs `next build` on route changes — catches accidental import of server secrets into client modules.

---

## 6. Known gaps & follow-up

These are documented limitations, not bugs:

1. **No SRI on third-party scripts.** Clerk and Sentry version their bundles aggressively; SRI hashes would break on every minor release. Trust is delegated to TLS + the allow-listed origins.
2. **No automated SAST/DAST.** No tooling like Snyk Code or OWASP ZAP runs against this codebase yet. Manual audits + the type system + the test suite are the current defenses.
3. **`unsafe-inline` in script-src.** Needed for Next.js's pre-paint bootstrap + the theme/lang detection script in `app/layout.tsx`. Tightening would require nonce-per-response middleware, which kills static optimization on a primarily-static site.
4. **No threat-modeling exercise with external reviewers.** This doc is a self-audit baseline; a fresh set of eyes would likely surface gaps.

---

## 7. Audit log

| Date       | Change                                                                       | PR   |
| ---------- | ---------------------------------------------------------------------------- | ---- |
| 2026-05-21 | Initial security posture doc; CSP report-uri added; header smoke-test script | #125 |
