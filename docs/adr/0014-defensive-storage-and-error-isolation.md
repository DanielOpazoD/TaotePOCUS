# ADR 0014 — Defensive storage migrations + granular error isolation

- **Status**: Accepted.
- **Date**: 2026-05-09 (Block A of the post-i18n stability pass)
- **Decider(s)**: Project lead

## Context

The ADR-0013 i18n rollout had a production crash one day after
Phase 3 deployed. Symptoms: visiting `/?cat=cardiac` rendered
fine for ~2 seconds, then the React tree threw with
`TypeError: Cannot read properties of undefined (reading 'forEach')`
deep inside a `useMemo` in `useCaseFilters`. The Service Worker
caught the failed render and the user saw the global "Algo salió
mal" boundary.

Root cause (commit `bc28792`):

1. The user had `localStorage.pocus_case_overrides` from BEFORE
   Phase 2 — entries shaped `{ "tw-1": { tags: ["foo"] } }`
   (legacy plain array).
2. Phase 2's `validateOverrideMap` normalizes overrides to the
   modern `{ es: [...] }` shape on read, BUT it only runs when
   the data first hydrates from disk. The hot path that bit us
   was different: `useCaseOverrides`'s React state had been
   hydrated in a previous session, the next mount used
   `repo.cases.listOverridesCached()` which returns the in-
   memory map directly without re-running the validator.
3. `mergeWithOverrides` spread the legacy `{ tags: ["foo"] }`
   patch on top of a Phase-2 case `{ tags: { es: [...] } }`. The
   spread reset `tags` to a plain array.
4. Downstream `getCaseTags(c, "es")` accessed `c.tags.es` on
   the array, which is `undefined`. The next call (`forEach` on
   the result) threw.

The hotfix (`bc28792`) defended `getCaseTitle` /
`getCaseDescription` / `getCaseTags` / `readLocalized` /
`searchHaystack` to normalize inline. That stopped the crash but
left the SOURCE — stale legacy data sitting in `localStorage` —
intact. A subsequent edge case (e.g. a backup restore) could
re-introduce it.

This ADR documents the structural follow-up that closes the
category of bugs.

## Decision

Three additions, shipped together as commit `a782efb` (Block A of
the post-rollout stability pass):

### 1. Versioned localStorage migrations (`lib/storage-migrations.ts`)

A monotonic schema version stamp in `localStorage` (key
`pocus_schema_version`) plus an upgrade ladder. On app start the
runner reads the stamp, walks the missing migrations in order,
and writes the new stamp back.

```ts
// lib/storage-migrations.ts
export const CURRENT_SCHEMA_VERSION = 1;

const MIGRATIONS: Record<number, () => void> = {
  1: migrateToV1, // Phase-2/3 bilingual shape upgrade
};

export function runStorageMigrations(): void {
  if (typeof window === "undefined") return;
  const from = readPersistedVersion();
  if (from >= CURRENT_SCHEMA_VERSION) return;
  for (let v = from + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
    MIGRATIONS[v]?.(); // logged + tolerant of partial failure
  }
  writePersistedVersion(CURRENT_SCHEMA_VERSION);
}
```

`migrateToV1` rewrites every affected key (`pocus_user_cases`,
`pocus_case_overrides`, `customCategories`,
`sectionLabelOverrides`) into the modern bilingual shape. Each
migration is idempotent — the normalizers used inside
(`normalizeLocalizedString`, `normalizeLocalizedTags`) treat the
modern shape as a no-op.

The runner is invoked from `App.tsx` via a module-level guard so
it fires exactly ONCE per client load, and BEFORE any descendant
hook reads the affected keys:

```ts
// components/App.tsx
let didRunStorageMigrations = false;
function ensureStorageMigrations() {
  if (didRunStorageMigrations) return;
  didRunStorageMigrations = true;
  runStorageMigrations();
}

export default function App() {
  ensureStorageMigrations();
  return <Suspense ...><LanguageProvider><AppInner/></LanguageProvider></Suspense>;
}
```

A `useEffect` would have fired POST-render — by then
`usePersistedState` has already hydrated React state from the
legacy shape, and the migration would only land on the next
navigation.

### 2. Granular ErrorBoundary by zone

Before this commit `App.tsx` had only two boundaries (`hero`,
`grid`). A crash anywhere outside those (Header, Sidebar, Toolbar,
FeaturedRow, MobileDrawer) would tumble the whole page into the
global `error.tsx` fallback — losing the user's place and
forcing a full reload.

After: every top-level zone has its own boundary. A bug in the
language switcher's outside-click handler doesn't take down the
grid; a crash in the sidebar's tag accordion doesn't kill the
top nav. The user can still navigate via the surfaces that
survive.

```tsx
// components/App.tsx — pattern repeated for header / sidebar / toolbar / featured
<ErrorBoundary name="header">
  <Header {...} />
</ErrorBoundary>
```

### 3. Consumer audit test (`tests/localized-consumer-audit.test.ts`)

Static scan of `components/` / `hooks/` / `lib/` for raw access
to bilingual case slots (`.title.es`, `.tags.en`, etc.) outside a
curated whitelist. CI-level guardrail against the exact pattern
that caused the crash.

```ts
const FORBIDDEN_PATTERNS = [
  { name: ".title.es", regex: /\.title\.es\b/ },
  { name: ".tags.es", regex: /\.tags\.es\b/ },
  // ... .title.en, .description.es, .description.en, .tags.en
];

const WHITELIST = new Set([
  "lib/case-localized.ts", // helper module IS the seam
  "lib/schemas.ts", // validator normalizes
  "lib/storage-migrations.ts", // rewrites legacy shapes
  "lib/case-description.ts", // explicit ES-baseline reader
  "lib/i18n/dict.es.ts", // string LITERALS, not field access
  "lib/i18n/dict.en.ts",
  // Admin productivity surfaces edit / sort by the ES slot
  // directly. Documented at the callsite.
  "components/admin/MinePanel.tsx",
  "components/admin/AdminPanel.tsx",
  "components/admin/ClassifierBoard.tsx",
  "components/admin/CaseForm.tsx",
  "components/admin/case-form/MetadataPanel.tsx",
  "components/admin/bulk-edit/BulkEditRow.tsx",
  "components/admin/bulk-edit/BulkEditTable.tsx",
  "components/admin/bulk-edit/cells/Thumb.tsx",
  "components/cards/AdminThumbMenu.tsx",
  "components/admin/classifier/useClassifierDrag.tsx",
  "components/admin/classifier/ClassifierDragHint.tsx",
  "components/App.tsx", // admin tag-vocabulary
]);
```

A future contributor that bypasses `getCaseTitle` /
`getCaseDescription` / `getCaseTags` to read the slot directly
gets a CI failure with a clear remediation message:

> Direct access to bilingual case fields detected outside the
> whitelist. These callsites can crash at runtime when a legacy-
> shaped patch is merged on top of a normalized case (production
> hotfix bc28792). Use the helpers in lib/case-localized — or add
> the file to the WHITELIST with a comment explaining why the
> raw access is safe.

## Consequences

### Pros

- **The legacy-data class of crashes is gone.** Migration on
  first load eliminates the source; the helper-level normalize
  is belt-and-braces; the audit test catches future regressions
  before they ship. Three independent layers, each cheap.
- **Schema versioning is now standard.** Future shape changes
  (Phase 4: dual-language audit log? richer `featured` shape?)
  add a `migrateToV2` / `migrateToV3` / etc. and bump the
  constant. The same machinery applies.
- **Users see less catastrophic failures.** A crash in the
  classifier doesn't lose the user's section nav. The
  granular boundaries also surface more useful logs (each
  boundary tags its area in `lib/log`).

### Cons

- **The migration runs ON EVERY APP START until the version
  catches up.** Idempotent, fast (~5 ms over 30 keys), but
  there's a one-time cost per legacy install. Trade we accept.
- **Adding a new bilingual field requires updating both the
  validator AND the v1 migration AND the consumer audit
  whitelist if a new productivity surface needs raw access.**
  Three places, but each documented at its location.

## Alternatives considered

- **Run a one-shot migration in CI / a build script.** Rejected:
  the data lives in user browsers, not in the deploy artifact.
  Server-side migration only catches DB writes, not the
  localStorage that bit us.
- **Detect the legacy shape lazily and rewrite on-the-fly inside
  every reader (no migration runner).** Rejected: the
  helper-level guards already do that for the read path, but
  WRITES would keep persisting whatever shape the React state
  carries. The explicit migration writes the corrected shape
  back to disk so the legacy data permanently disappears.
- **Skip the consumer audit; rely on TypeScript.** Rejected:
  TypeScript happily accepts `c.tags.es.includes(...)` because
  the static type IS `LocalizedTags` — the bug is at runtime
  when a legacy patch overwrites that contract.

## Verification

- `npm run typecheck` ✓
- `npm run lint` ✓
- `npm test` → 729 pass / 1 skip (10 new tests in
  `tests/storage-migrations.test.ts` and the audit test).
- `npm run build` ✓
- `npx playwright test` → 15/15 functional + 5/5 visual ✓.
- `npm run test:coverage` → above the 90% statements / 80%
  branches / 90% functions / 90% lines threshold (see
  `vitest.config.ts`).

## Related

- ADR-0013 (bilingual rollout) — what created the shape mismatch
  this ADR closes.
- Commit `bc28792` — the original hotfix.
- Block A-E execution (in commit history `a782efb` → `f90cea4` →
  `a1bb1e9` → `a56e6a7` → this commit) — the broader stability
  pass that bundles this ADR with admin chrome i18n, saved
  views, and BulkEdit perf wins.
