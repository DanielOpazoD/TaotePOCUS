export type SectionId = "atlas" | "ecg" | "cases" | "info" | "rayos";

export interface Section {
  id: SectionId;
  label: string;
  sub: string;
}

/**
 * Built-in category ids — kept as a literal union for documentation
 * and for the seed catalog where the id is statically known.
 *
 * `Category.id` and `CaseRecord.category` are widened to `string` so
 * the admin can introduce custom categories at runtime (persisted via
 * `useCustomCategories`) without forking the type system. The literals
 * still pass type-check for any code that uses them, so call sites
 * like `category === "cardiac"` keep working unchanged.
 */
export type CategoryId =
  | "cardiac"
  | "lung"
  | "abdominal"
  | "fast"
  | "vascular"
  | "ob"
  | "ms"
  | "proc";

export interface Category {
  /** Built-in literal or runtime-defined custom id (prefixed `c:`). */
  id: CategoryId | string;
  /**
   * Display label.
   *
   * Two shapes coexist for transitional reasons:
   *   - **Plain string** — what the legacy persistence and the
   *     static `CATEGORIES` table (`lib/data.ts`) ship today. Built-in
   *     ids resolve their bilingual labels via the i18n dictionary
   *     (`section.cardiac` etc.); the plain string is the fallback.
   *   - **`LocalizedString`** — what custom (admin-created) categories
   *     persist in Phase 3+, so the admin can give each category a
   *     Spanish + optional English name.
   *
   * Renderers go through `categoryLabel(c, lang)` from
   * `lib/i18n/index.ts` which handles both shapes + dictionary lookup
   * + EN→ES fallback.
   */
  label: string | LocalizedString;
}

/**
 * `Category` enriched with the number of cases that fall under it
 * within a given scope. Computed by `useCaseFilters` and consumed by
 * the sidebar — never stored, always derived.
 */
export interface CategoryWithCount extends Category {
  count: number;
}

export type LoopKind =
  | "blines"
  | "tamponade"
  | "morrison"
  | "seashore"
  | "ijv"
  | "dvt"
  | "hydro"
  | "ob"
  | "lvfunction"
  | "aaa"
  | "consolidation"
  | "gallstone"
  | "ecg-stemi"
  | "ecg-afib"
  | "ecg-block"
  | "info-blue"
  | "info-rush"
  | "info-fast";

export type MediaKind = "video" | "image" | "gif";

export interface Media {
  kind: MediaKind;
  src: string;
  name?: string;
  type?: string;
  modality?: string;
}

/**
 * Translatable string slot for case content. Spanish is the canonical
 * baseline (every case must have it); English is optional and gets
 * filled in by the admin one case at a time. When `en` is missing,
 * the renderer falls back to `es` and shows a small "ES" badge so
 * the EN reader knows the content hasn't been translated yet.
 *
 * Legacy persistence shape (plain `string`) is migrated lazily on
 * read by `lib/case-localized.ts > normalizeLocalizedString` — the
 * type below is the post-migration shape every consumer sees.
 */
export interface LocalizedString {
  es: string;
  en?: string;
}

/**
 * Translatable tag list. Tags are free-form (per the product call —
 * no shared taxonomy) so each language has its own independent list.
 * Legacy `string[]` is migrated to `{ es: [...] }` on read.
 */
export interface LocalizedTags {
  es: string[];
  en?: string[];
}

export interface CaseRecord {
  id: string;
  section: SectionId;
  /**
   * Bilingual case title. Spanish is mandatory (baseline editorial
   * content), English is optional (admin fills it in case by case).
   * Renderers go through `getCaseTitle(c, lang)` from
   * `lib/case-localized.ts` which handles the EN→ES fallback and
   * surfaces a `isFallback` flag so the UI can show a small badge.
   *
   * Persistence: legacy cases stored as `title: string` are migrated
   * lazily on read — see `normalizeCase` in `lib/case-localized.ts`.
   */
  title: LocalizedString;
  /**
   * Category id — either a built-in literal (CategoryId) or a custom
   * id created via the admin Categorías editor. Stored as `string` so
   * runtime-added categories don't require a type-system change.
   */
  category: CategoryId | string;
  /**
   * Bilingual tag lists. Independent per language (free-form tags,
   * no shared taxonomy). EN list is optional; when absent renderers
   * fall back to the ES list. Filter / search consumers read via
   * `getCaseTags(c, lang)`.
   */
  tags: LocalizedTags;
  modality: string;
  /**
   * Identifies the synthetic cine-loop scene to render when no real
   * media is attached. The narrow union is enforced — adding a new
   * scene means extending `LoopKind` here AND `cineScenes.drawScene`.
   */
  loop: LoopKind;
  author: string;
  role: string;
  date: string;
  /**
   * Bilingual case body. Spanish baseline + optional English; same
   * fallback semantics as `title`. Read via
   * `getCaseDescription(c, lang)` in `lib/case-localized.ts`. The
   * one-line `getDescription(c, lang)` in `lib/case-description.ts`
   * is the legacy seam (kept so future migrations land in one place).
   *
   * History: in May-2026 the trio (`summary` + `findings` +
   * `diagnosis`) was collapsed into a single `description: string`
   * field per ADR-0010. Phase-2 i18n (Nov-2026) widened the field
   * to `LocalizedString` while preserving the same indirection.
   */
  description: LocalizedString;
  featured?: boolean;
  /**
   * Primary uploaded media (the "cover" item shown on the card and as
   * the first slide in the modal carousel). Absence (undefined) means
   * "use the synthetic loop".
   */
  media?: Media;
  /**
   * Additional media items attached to the same case. Surfaced inside
   * the modal as a horizontal carousel; the card thumbnail still
   * renders only `media`. The split (`media` + `mediaExtra`) is a
   * back-compat compromise so the imported corpus stays as-is — see
   * `getCaseMedia` in `lib/case-meta.ts` for the unified read path.
   */
  mediaExtra?: Media[];
  /**
   * Editorial difficulty hint. Used to filter the catalog and to show
   * a pill in the case modal. Cases without an explicit value default
   * to "intermediate" in the UI.
   */
  difficulty?: "basic" | "intermediate" | "advanced";
  /**
   * ISO timestamp of the last meaningful edit to the case copy. When
   * absent, `date` (publication date) is used. Surfaced in the modal
   * author bar so readers know how fresh the entry is.
   */
  lastUpdated?: string;
  // Soft-delete metadata. Audit trail visible to admins; hidden from
  // public views. The case record stays in storage so a deletion can
  // be reverted without losing the underlying media.
  deletedAt?: string; // ISO timestamp
  deletedBy?: string; // email of the admin who deleted it
  /**
   * Editorial review state. Set to `true` once the admin has verified
   * the case is correctly classified (section, category, title,
   * description). Drives an internal-only badge in the admin views
   * and the queue filter on /admin/clasificar — never shown publicly.
   *
   * Persisted as part of the override map (so re-imports don't reset
   * the review state).
   */
  reviewed?: boolean;
  /**
   * Permanent-delete marker. Distinct from `deletedAt`:
   *
   *   - `deletedAt` is a soft-delete (case is hidden but recoverable
   *     via the admin trash).
   *   - `purged` is a hard-delete (case is gone forever — the override
   *     stays as a tombstone so the catalog merge keeps filtering it
   *     out across re-imports). The blob store entry is also deleted.
   *
   * Once a case is purged it cannot be restored from inside the app.
   * The only recovery is a backup JSON imported from before the purge.
   */
  purged?: boolean;
  /**
   * Optional thumbnail focal-point + zoom. Lets the admin reframe what
   * shows inside the fixed grid cell without changing the cell itself
   * — useful when the imported Twitter media has off-center subjects
   * or letterboxed frames.
   *
   *   - `x` / `y`: 0–100, percentages applied via `object-position`.
   *     Default 50/50 (centered).
   *   - `scale`: zoom multiplier. Range 0.5–3, default 1.
   *
   * Scale crosses a `cover ↔ contain` threshold at 1:
   *
   *   - At `scale = 1` the image renders with the default
   *     `object-fit: cover` (fills the cell, cropping whichever axis
   *     overflows). This is the legacy framing.
   *   - At `scale > 1` cover stays in effect with an additional
   *     `transform: scale(N)` — the same crop, zoomed further in.
   *   - At `scale < 1` the renderer SWITCHES to `object-fit: contain`,
   *     so the full image is visible (letterboxed if the aspect
   *     differs) and the previously-cropped regions appear. The
   *     transform scale composes on top to shrink the visible image
   *     further within the letterbox if needed.
   *
   * All three are optional; omitting any leaves the default. The
   * external container (the grid cell, the modal pane) is not touched.
   */
  focus?: FocusValue;
}

/**
 * Thumbnail focal-point + zoom. Used inline on `CaseRecord.focus` for
 * per-case overrides AND on the admin-wide `FocusDefaults` for
 * scope-level defaults (global / section / category).
 *
 *   - `x` / `y`: 0–100, percentages applied via `object-position`.
 *     Default 50/50 (centered).
 *   - `scale`: zoom multiplier. Range 0.5–3, default 1.
 *
 * Resolution at render time: `caso.focus` → category default →
 * section default → global default → hard-coded `{ x:50, y:50, scale:1 }`.
 * See `lib/focus.ts → resolveFocus()`.
 */
export interface FocusValue {
  x?: number;
  y?: number;
  scale?: number;
}

/**
 * Admin-wide default focus values, scoped from broadest (global) to
 * narrowest (per-category). Shipped through `useFocusDefaults` and
 * persisted in localStorage. The resolver in `lib/focus.ts` walks
 * narrowest → broadest at read time.
 *
 * Empty/undefined slots fall through to the next layer. A category
 * slot supersedes a section slot, which supersedes the global slot.
 * All three layers are bypassed entirely whenever the case carries
 * its own `caso.focus` (per-case override stays the most specific).
 */
export interface FocusDefaults {
  /** Applies to every case in every section / category unless a
   *  more specific slot overrides it. */
  global?: FocusValue;
  /** Per-section overrides keyed by `SectionId`. */
  sections?: Partial<Record<SectionId, FocusValue>>;
  /** Per-category overrides keyed by category id (built-in or
   *  custom). Custom category ids are runtime-defined; the resolver
   *  treats unknown ids as a no-op (falls through to section). */
  categories?: Record<string, FocusValue>;
}

export interface User {
  email: string;
  name: string;
  initials: string;
  role: "user" | "admin";
  /** Epoch millis. Sessions are rejected after this time on next read. */
  expiresAt: number;
  /** When the session was issued. Useful for audit trails. */
  issuedAt: number;
}

export type View = { kind: "section"; section: SectionId } | { kind: "favs" } | { kind: "admin" };
