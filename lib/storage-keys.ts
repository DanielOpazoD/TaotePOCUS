// Centralized inventory of every browser storage key the app reads
// or writes. Three reasons for the central registry:
//
//   1. Refactor safety. If you rename `pocus_user` you can grep for
//      one symbol instead of fishing for a bare string literal across
//      hooks, repos, tests and the backup module — and the typecheck
//      catches every callsite.
//
//   2. Drift detection. Two modules used to encode the same logical
//      key independently (`store.ts` wrote `pocus_user_cases` as a
//      bare string; `backup.ts` rebuilt it as `${PFX}user_cases`).
//      That's invisible at the literal level — a typo would produce
//      orphaned writes that show up only when the admin restores
//      from backup. With the registry the keys come from one place
//      so they can't drift.
//
//   3. Documentation. `Cmd-click` lands you here; the JSDoc on each
//      key documents shape, lifecycle and which module owns it. New
//      contributors don't have to reverse-engineer the conventions.
//
// Naming policy:
//   - `pocus_*` — namespaced under our own prefix (session, cases,
//     favs, theme). Mostly long-lived data the backup module
//     captures or wants to leave alone deliberately.
//   - bare keys (`customCategories`, `sidebarCollapsed`) — predate
//     the prefix convention. We keep them for backward compatibility
//     with existing browsers; renaming them would silently drop
//     state on upgrade. NEW keys should use the `pocus_*` namespace.
//   - `pocus_filters:<section>` — namespaced + colon-templated for
//     per-section persistence (one slot per section id).
//
// Server-side cookies (`pocus_session`) live in `lib/server/session.ts`
// because they're constrained by Next.js cookie APIs and never touch
// `localStorage`. Importing this file from server code is fine; the
// `STORAGE_PREFIX` constant is just a string.

/** Common prefix for `pocus_*` localStorage keys. Exposed so the
 *  `Store.estimateUsage` walker and the backup writer can match
 *  every owned key without re-spelling the prefix. */
export const STORAGE_PREFIX = "pocus_";

/**
 * Every fixed-name key the app reads or writes. Templated keys
 * (favorites per-email, filters per-section) live below as factory
 * functions so the per-instance interpolation is explicit.
 *
 * Read-aloud convention: `STORAGE_KEYS.user` returns `"pocus_user"`.
 */
export const STORAGE_KEYS = {
  // ─── Session & catalog (long-lived, in backup bundle) ──────────

  /** Persisted client session blob (`User | null`). Cleared on
   *  logout. The corresponding server cookie is `pocus_session`. */
  user: "pocus_user",

  /** Admin-authored case list. Includes soft-deleted entries so the
   *  Papelera surface keeps working without an extra slot. */
  userCases: "pocus_user_cases",

  /** Per-case override map keyed by case id. Each entry is a
   *  `Partial<CaseRecord>` — the admin can override any field
   *  without modifying the upstream catalog. Survives
   *  `apply-twitter-import.mjs` regenerations. */
  caseOverrides: "pocus_case_overrides",

  // ─── Admin metadata (in backup bundle) ─────────────────────────

  /** Custom categories defined by the admin (`Category[]`). The
   *  built-in catalog categories are not stored — only additions. */
  customCategories: "customCategories",

  /** Admin-hidden category ids (`string[]`). Hidden categories stay
   *  in the catalog and remain reachable by direct URL; the toggle
   *  only filters the public sidebar nav. */
  hiddenCategoryIds: "hiddenCategoryIds",

  /** Admin-hidden section ids (`SectionId[]`). Same semantics as
   *  hiddenCategoryIds — public nav filter, deep links still work. */
  hiddenSectionIds: "hiddenSectionIds",

  /** Admin-renamed section labels (`Record<SectionId, string>`).
   *  Pure cosmetic; ids and URL paths are unchanged. SEO surfaces
   *  (sitemap, OG metadata) keep using the static defaults. */
  sectionLabelOverrides: "sectionLabelOverrides",

  // ─── UI prefs (NOT in backup bundle — per-device) ──────────────

  /** Theme preference (`"light" | "dark"`). Initial render is
   *  decided in an inline script at the top of `app/layout.tsx`
   *  to avoid a flash on first paint, so this key is read from
   *  two places. Keep them aligned. */
  theme: "pocus_theme",

  /** Sidebar collapsed flag (`"1" | "0"`). Compact serialization
   *  keeps the localStorage value short and grep-friendly. */
  sidebarCollapsed: "sidebarCollapsed",

  /** Sidebar "Etiquetas" accordion open flag (`boolean`). */
  sidebarTagsOpen: "sidebarTagsOpen",

  /** Last successful backup timestamp (ISO string). Surfaced in
   *  the BackupPanel as a "última copia" hint. */
  lastBackupAt: "pocus_last_backup_at",

  /** UI language preference (`"es" | "en"`). Source-of-truth order:
   *  URL `?lang=` > this localStorage slot > `navigator.language`
   *  detection > `DEFAULT_LANG`. Read by the pre-paint script in
   *  `app/layout.tsx` so `<html lang>` is set before hydration —
   *  keep both spellings aligned if the key is renamed. */
  lang: "pocus_lang",

  /** Persisted schema version of the localStorage payload. Bumped
   *  by `lib/storage-migrations.ts` on each breaking shape change.
   *  When the persisted version is below the latest known, the
   *  migration runner walks the upgrade ladder once at app start
   *  and writes the new version back. Missing key (legacy install,
   *  Safari Private flush) is treated as version 0 — every
   *  migration runs from scratch on top of whatever data is there.
   *
   *  Versions:
   *    0 = pre-Phase-2 (plain string title / description, plain
   *        string[] tags, plain string category labels, plain
   *        string section overrides).
   *    1 = Phase-2/3 (LocalizedString / LocalizedTags everywhere).
   */
  schemaVersion: "pocus_schema_version",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

// ─── Templated keys (one slot per id) ──────────────────────────

/** Favorites list per email. Anonymous visitors share the synthetic
 *  bucket `"guest"`. The backup module enumerates every `favsKey()`
 *  match by walking `localStorage` and stripping the prefix. */
export function favsKey(email?: string | null): string {
  return `${STORAGE_PREFIX}favs_${email || "guest"}`;
}

/** Stable prefix for `favsKey` so enumerators can match-and-strip
 *  without rebuilding the templating rule. Equals `"pocus_favs_"`. */
export const FAVS_KEY_PREFIX = `${STORAGE_PREFIX}favs_` as const;

/** Per-section filter persistence. Keeps a "Cardíaco" filter in
 *  Atlas from cross-contaminating ECG. */
export function filtersKey(sectionId: string): string {
  return `${FILTERS_KEY_PREFIX}${sectionId}`;
}

/** Stable prefix for `filtersKey`. Equals `"pocus_filters:"`. */
export const FILTERS_KEY_PREFIX = `${STORAGE_PREFIX}filters:` as const;
