# ADR 0013 — Bilingual rollout (Spanish + English)

- **Status**: Accepted.
- **Date**: 2026-05-08 → 2026-05-09 (Phases 1–3 + hotfix)
- **Decider(s)**: Project lead

## Context

Taote POCUS is a Chilean POCUS atlas. The editorial canon is in
Spanish: every static surface, every imported case, every category
label, every admin form. The user (Daniel) asked to add an English
view of the page so non-Spanish-speaking users can browse the same
catalog without translation tools.

Three constraints shaped the decision:

1. **Clinical content precision matters.** A mistranslated
   "derrame pleural" or a misclassified "FAST" tag would erode
   trust in an atlas designed for medical training. Auto-translation
   was rejected — the admin (Daniel himself) translates manually,
   case by case.
2. **Migration must be silent.** Real users have data in
   `localStorage` (favorites, custom categories, override edits)
   from before the type widening. They can't be asked to re-import
   anything; the schema upgrade has to be invisible.
3. **The infrastructure should be reusable.** A future third
   language (Portuguese? French?) shouldn't require a second
   round of architectural decisions.

## Decision

Roll out i18n in three phases, each landing as a separate commit
that verifies clean (typecheck + lint + 700+ unit tests + 15 e2e +
5 visual snapshots):

### Phase 1 — UI chrome (commits `6e3104e`)

Foundation for every later phase. Touched only the static UI
strings.

- `lib/i18n/types.ts` — `Lang = "es" | "en"`, `LANGS`,
  `DEFAULT_LANG`, `isLang`, `detectBrowserLang`, `localeOf`.
- `lib/i18n/dict.es.ts` — canonical Spanish dictionary (`as const`,
  flat dot-namespaced keys: `nav.favoritos`, `pwa.offline`,
  `section.atlas`, …).
- `lib/i18n/dict.en.ts` — English mirror (typed as `Dict =
Record<DictKey, string>` so missing or extra keys are TypeScript
  errors at compile time; no runtime parity check needed).
- `lib/i18n/index.ts` — barrel + `interpolate({name})`,
  `translate(lang, key, vars)`, `formatDate(input, lang)`,
  `formatDateTime`, `sectionLabel`, `sectionSub`, `categoryLabel`,
  `categoryLabelEs` (admin productivity shortcut).
- `hooks/useLanguage.tsx` — context provider + `useLanguage()` /
  `useT()` hooks. Source-of-truth order for the active language:
  URL `?lang=` → localStorage `pocus_lang` → navigator detect →
  `DEFAULT_LANG`. Mutations write to URL via
  `history.replaceState` (no RSC fetch — same trick `useViewState`
  uses for filter changes), localStorage, `<html lang>`, and the
  cross-tab channel.
- Pre-paint script in `app/layout.tsx` sets `<html lang>` BEFORE
  React hydrates so the initial render lands in the right
  language without a flash.
- `components/chrome/LanguageSwitcher.tsx` — globe icon + listbox
  trigger, click-outside / ESC dismiss, native focus-back-to-
  trigger.
- Translated chrome surfaces: Header / MobileDrawer / Sidebar /
  Toolbar / Footer / PWAStatus / ThemeToggle / page heads via
  `derivePageHead(view, cat, overrides, lang)`.

Playwright config pinned `locale: "es-CL"` so e2e Chromium
doesn't auto-detect English and break specs that assert Spanish
copy.

### Phase 2 — Bilingual case content (commit `dcbe12e`)

Widened `CaseRecord` to carry Spanish + optional English for every
translatable field. **Auto-translation rejected.** Admin translates
manually, one case at a time.

```ts
// lib/types.ts (new shapes)
interface LocalizedString {
  es: string; // mandatory baseline
  en?: string; // optional translation
}
interface LocalizedTags {
  es: string[];
  en?: string[]; // independent per-language list (free-form tags,
  // no shared taxonomy per the product call)
}

// CaseRecord.title / .description widened to LocalizedString
// CaseRecord.tags widened to LocalizedTags
```

**Lazy migration via the schema validator.** `lib/schemas.ts`'s
`validateCase` and `validateOverrideMap` accept BOTH the legacy
plain-string shape and the modern object, normalizing on output via
`normalizeLocalizedString` / `normalizeLocalizedTags`. Every
consumer downstream of the data boundary sees the modern shape.
No backfill script needed.

**Public read path** with EN→ES fallback + small "ES" badge:

- `getCaseTitle(c, lang) → { value, isFallback, source }` etc.
- `<FallbackBadge>` mounts inline next to title / summary / tags
  whenever `isFallback === true`.
- `searchHaystack(c)` indexes both languages so a query in either
  language matches partially-translated cases.
- `compareTitles(a, b, lang)` for sorting.

**Admin editor** (`MetadataPanel`) now renders ES + EN inputs side
by side. ES is required, EN is optional, save validation only
gates ES.

**Admin productivity surfaces** (BulkEditTable, ClassifierBoard,
MinePanel) work with the canonical Spanish slot directly via
`categoryLabelEs(c)` / `c.title.es` — admin work is editorial,
the visitor language doesn't apply.

### Phase 3 — Custom categories + section labels (commit `fee689b`)

Final non-content surface that was still monolingual: admin-created
custom categories (`c:foo`) and section-label overrides.

- `Category.label` widened to `string | LocalizedString` (transitional
  union so legacy entries coexist).
- Section overrides widened to
  `Partial<Record<SectionId, LocalizedString>>`.
- `useCustomCategoriesData` and `useSectionLabels` normalize on
  hydrate / cross-tab sync / DB rehydrate.
- `CategoriesEditor` and `SectionsEditor` exposed dual ES + EN
  inputs for create / rename. Built-ins stay read-only.

### Hotfix (commit `bc28792`) — defensive helpers

Production crash discovered post-deploy: a stale legacy override in
`localStorage` from a previous session merged on top of a
normalized case in `mergeWithOverrides`. The spread
`{ ...c, ...patch }` reverted `tags` from `{ es: [...] }` to a
plain array, then `getCaseTags` accessed `.es` on the array and
crashed with "Cannot read properties of undefined".

Three layers of defense:

1. **Root cause**: `mergeWithOverrides` re-normalizes the bilingual
   slots after the spread via `normalizeCase`.
2. **Helper-level guards**: `readLocalized` /
   `getCaseTitle` / `getCaseDescription` / `getCaseTags` / `searchHaystack`
   normalize inline before reading. Belt-and-braces against any
   future callsite that hand-crafts a record.
3. **Regression test**: `tests/useCaseOverrides.test.tsx` pins
   the exact crash scenario.

Block A (commit `a782efb`) followed up with versioned storage
migrations to eliminate the SOURCE of legacy shapes — see ADR-0014.

## Consequences

### Pros

- **Editorial precision preserved.** Every translation is admin-
  authored. Clinical phrasing (e.g. "Lung POCUS" vs literal
  "Pulmonary US") is decided case by case.
- **No migration script.** The schema validator + the lazy-read
  helpers + the storage migrations (ADR-0014) close every
  ingress. A user upgrading sees zero prompts.
- **Type-enforced parity.** `Dict = Record<DictKey, string>` makes
  a missing translation a compile error, not a runtime fallback.
- **EN→ES fallback is explicit.** The UI shows a small "ES" badge
  whenever the EN slot is missing — never lies to the EN reader.
  When the admin fills in the translation later, the badge
  disappears automatically; no migration step.
- **Cross-tab sync from day one.** Saving a translation in one
  tab refreshes the other tab via the existing `BroadcastChannel`
  topic (`"language"` for the active lang, `"saved-views"` etc.
  for the data layers). No "stale F5" surprise.
- **Reusable infrastructure.** Adding a third language is:
  (1) extend `Lang` union, (2) ship `dict.<lang>.ts`, (3) add a
  `LANGS` entry. Every translation surface picks it up via the
  existing dict resolver.

### Cons

- **Phase 2 was the biggest commit so far** (1546 LOC across 46
  files). The schema widening touched every CaseRecord consumer.
- **Admin "productivity surfaces" still show ES regardless of UI
  language.** Intentional — the admin works with the editorial
  source — but a future contributor might miss the convention. The
  consumer audit test (ADR-0014, Block A) catches a `.es` access
  outside the whitelist.
- **DB schema unchanged.** Custom-category labels still persist
  the ES slot only in Postgres. EN translations live in
  `localStorage` per browser. Promoting `label` to JSONB is a
  future migration.

## Alternatives considered

- **Auto-translation in build / runtime via an LLM.** Rejected:
  POCUS content is clinical, mistranslation has trust cost. The
  admin volunteers manual translation. Auto-translate could come
  back as a "draft pre-fill" affordance — not as the primary path.
- **Single-language deploys per domain (`/en/...` vs `/es/...`).**
  Rejected as overkill for a small atlas. The same case at
  `/atlas?cat=cardiac&lang=en` shares structured data, server
  cache, and OG metadata with its Spanish counterpart — only the
  rendered text changes per visitor.
- **`next-intl` or `react-i18next`.** Rejected: ~80 KB minified
  for what amounts to a flat dictionary lookup + variable
  interpolation. The hand-rolled module is ~140 LOC and matches
  the rest of the project's "small dependency surface" philosophy.
- **Tags as taxonomy** (id-based with translated labels) rather
  than free-form lists per language. Rejected per the product
  call — the catalog uses tags as ad-hoc free text, and a
  taxonomic refactor wasn't on the table. The two language slots
  are independent lists; admin curates each manually.

## Verification

After Phase 3 ships:

- `npm run typecheck` clean.
- `npm test` → 717 pass / 1 skip (24 new tests across `i18n.test`,
  `useLanguage.test`, `LanguageSwitcher.test`, `case-localized.test`,
  `saved-views.test`, plus migration tests).
- `npm run build` clean.
- Playwright → 15/15 functional + 5/5 visual snapshots refreshed.
- `tests/localized-consumer-audit.test.ts` enforces the
  no-raw-`.es`-access policy; whitelisted entries each carry a
  comment explaining why.

## Future work (not in this ADR)

- Refinements to the admin chrome covered in Block B (see ADR-0014
  for the `Bloque A-E` execution).
- DB schema for custom-category EN slots (currently localStorage-
  only) is a follow-up if/when category translations need to sync
  cross-device.
- A third language (Portuguese is the natural next given the LATAM
  reader base) is now a one-pager change.
