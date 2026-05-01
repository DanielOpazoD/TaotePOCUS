# ADR 0009 — Uniform catalog UI: single header, single grid

- **Status**: Accepted.
- **Date**: 2026-05-05
- **Decider(s)**: Project lead

## Context

The early UI had editorial ambitions:

- **Per-section heros** — Atlas with stats + sparkline + "Caso
  destacado" CTA + aurora-mesh backdrop; ECG with three animated
  polyline strips; Cases with a serif-display gradient title and a
  lede paragraph; Info with a geometric SVG poster + parallax. Each
  ~60–100 LOC of TSX plus its own CSS block.
- **Bento grid on Atlas** — a 2×2 hero card on the top-left and
  interleaved `<QuoteCard>` pull-quotes between the standard
  thumbnails. Driven by container queries and a separate
  `case-grid--bento` modifier.

Both patterns came from the magazine-spread aesthetic the project
opened with. They worked on a marketing landing; they fought
against the catalog use case once the corpus passed ~50 cases.
User feedback (May 2026) made the failure mode explicit:

- The hero pushed the case grid below the fold on every section.
- The Atlas Bento made the first case look like an editor's pick
  even when no case was actually featured (the fallback was
  "first case in the list", which is meaningless for the reader).
- Reading the Atlas as the front page rather than the catalog set
  the wrong vocabulary — the `Administrar` view, with its uniform
  grid of equal-sized thumbnails, was what users actually wanted
  everywhere.

## Decision

Collapse to one head, one grid:

1. **One section header** — `components/hero/CompactHead.tsx`,
   rendered for every section. Crumb + h1 + subtitle, no
   decoration. The h1 dropped from 38px to a clamped 24–30px;
   margins tightened so the toolbar + grid sit closer to the top
   edge.
2. **One catalog grid** — `<div className="case-grid">{filtered.map(CaseCard)}</div>`
   on every view including Atlas. The Atlas-special-case branch in
   `MainGrid.tsx` was deleted; `BentoGrid` and `QuoteCard`
   components removed; `case-grid--bento` and `quote-card-*` CSS
   blocks deleted.

The `SectionHero` dispatcher was kept (one-line wrapper around
`CompactHead`) so a future per-section accent (e.g. a thin colored
rule under the title) can be added in one place without touching
every caller.

## Consequences

### Pros

- **The catalog reads as a catalog.** Every section has the same
  visual vocabulary; the user learns one pattern.
- **Less code.** Net ~–1700 LOC across the two cleanups (Bento
  removal + hero unification): four hero variants, one bento
  layout, one quote card, one sparkline, one count-up hook, two
  test suites, one entire CSS file (`hero.css`).
- **Faster first paint.** ~30vh recovered above the fold means the
  case grid is interactive sooner. The image-priority recovery is
  the explicit user-stated goal.
- **No scroll-driven parallax / aurora animations.** Two fewer
  animation timelines competing for the main thread on landing.

### Cons

- **Loss of editorial personality.** The four heros had real
  craft (variable-font axes, aurora gradients, ECG paper grid).
  We kept the typography stack (Newsreader serif, IBM Plex Sans/Mono)
  and the section-accent token, so the visual identity isn't gone
  — just no longer expressed in oversized headers.
- **No hero CTA for "case of the week".** The Atlas
  `hero-cta` had a "Caso destacado" affordance pulling the first
  featured case. Editors wanting to promote a single case will need
  a new pattern (e.g. a `featured: true` row inserted at the top of
  the grid). Out of scope for this ADR.

## Alternatives considered

- **Smaller heros, kept per-section.** Rejected: the per-section
  variations were the cognitive cost; shrinking each one would have
  preserved the cost without the benefit.
- **Single hero, gated to landing only.** Rejected for the same
  reason — the asymmetry between landing and category-narrowed
  views was confusing.

## Migration / future work

If a "featured case" affordance returns, it should sit _inside_ the
grid (a sticky first card, or a row above the grid that uses the
same `CaseCard` chrome) rather than as a separate hero CTA. The
uniform grid is the unifying mental model; affordances that respect
it stay legible.
