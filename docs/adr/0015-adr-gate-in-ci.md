# ADR 0015 — ADR gate enforced by CI

- **Status**: Accepted
- **Date**: 2026-05-23
- **Decider(s)**: Project lead

## Context

The project ships 14 ADRs (`docs/adr/0001-0014`) that explain why the
non-obvious decisions were made the way they were. Every audit lands
one in the face of "wait, why is the dual-write structured this way?"
or "why is `useViewState` the URL?" The answers are right there in
the matching ADR, not scattered across commit messages.

But the practice is **manual**. Nothing prevents a future architectural
change from skipping the ADR step:

- The data layer gets a third storage tier and the dual-write gains
  a new branch — no ADR.
- The AI provider contract grows a new field for streaming responses
  — no ADR.
- `eslint.config.mjs` switches to a new layer rule that subtly
  changes what's importable from where — no ADR.

When the next person (or future me) tries to understand why one of
these changes happened, the trail goes cold at the commit message,
which is necessarily focused on the WHAT, not the underlying WHY.

The other side of the same problem: ADRs sometimes get written
**after** the fact, when memory of the alternatives is fuzzy. The
window where the decision is still hot — when the trade-offs are
fresh — is the window where the ADR is honest.

## Decision

A CI gate runs on every pull request. If the PR touches any path in
the **architectural surface** (see list below) AND does not ship a
new ADR file AND does not carry a `[skip-adr]` token in the PR body,
the gate fails the PR.

**Architectural surface** (matched in `scripts/check-adr-gate.mjs`):

- `lib/repo/**` — data layer (repository facade, dual-write)
- `lib/server/**` — server-side critical (session resolution)
- `lib/ai/registry.ts`, `lib/ai/provider.ts` — AI provider contract
- `lib/storage-migrations.ts` — on-disk schema migrations
- `lib/env.ts` — runtime config + feature flags
- `lib/schemas.ts`, `lib/schemas/api/**` — corpus + wire contracts
- `app/api/**` — HTTP API surface
- `proxy.ts` — Next.js middleware
- `next.config.mjs`, `tsconfig.json`, `vitest.config.ts` — build /
  compiler / test config
- `eslint.config.mjs` — code rules (layer boundaries, restricted imports)
- `.github/workflows/ci.yml` — the CI gate itself

**Skip token**: `[skip-adr]` anywhere in the PR body lets a PR
through. Convention is to follow with a one-line reason, e.g.
`[skip-adr]: revert of #134`. The token is a safety valve, not a
default — leaning on it for every PR defeats the gate.

The gate runs only on `pull_request` events. Pushes to `main` (which
happen via squash-merge anyway) don't re-run the check.

## Consequences

**Gets better:**

- ADRs are written when the decision is hot, not retroactively.
- A reader looking at any architectural file can `grep docs/adr/`
  with confidence that an ADR exists for the latest decision shape.
- New contributors get a hint from CI when they unknowingly cross
  an architectural line — `[skip-adr]` is a moment for them to
  ask "should this be an ADR?" before opting out.

**Gets worse:**

- A 3-line typo fix in `app/api/health/route.ts` requires either
  an ADR (overkill) or the skip token (one-line annotation). Small
  ongoing cost; we judged it worth the protective signal on the
  matching 50-line refactors.
- The "architectural surface" list itself is now an architectural
  decision that needs to stay current. New paths added to the
  codebase (e.g., if we add `lib/sse/` for server-sent events)
  need to be added to the regex list in `check-adr-gate.mjs`.
  Forgetting to add them means the gate silently misses
  architectural changes there — invisible failure mode. Mitigation
  is the regular audit cadence already in place.

## Alternatives considered

1. **Per-file CODEOWNERS that requires a doc reviewer**: gives a
   human checkpoint at PR review time, but loses the "write the
   ADR while it's hot" property — the reviewer can ask for an
   ADR after the code is settled, but at that point the
   alternatives memory has cooled.

2. **Lint-level rule**: would let us catch it earlier (locally
   during dev), but ESLint doesn't have native PR-body awareness,
   and we'd lose the skip token's utility. CI is the right layer
   because it knows what's in the diff vs main AND can read the
   PR body.

3. **Soft warning instead of hard fail**: the warning never
   converts into action. The whole point of a forcing function is
   that it forces. The skip token is the safety valve for the
   genuinely-not-architecture cases.

## Implementation

- `scripts/check-adr-gate.mjs` — the gate logic.
- `.github/workflows/ci.yml` — the CI step (after `Coverage delta
vs main`).
- `docs/adr/template.md` — the template new ADRs copy from.
- `.github/pull_request_template.md` — mentions the gate + the
  skip token so contributors see it before pushing.
