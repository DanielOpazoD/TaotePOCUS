export type SectionId = "atlas" | "ecg" | "cases" | "info";

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
  label: string;
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

export interface CaseRecord {
  id: string;
  section: SectionId;
  title: string;
  /**
   * Category id — either a built-in literal (CategoryId) or a custom
   * id created via the admin Categorías editor. Stored as `string` so
   * runtime-added categories don't require a type-system change.
   */
  category: CategoryId | string;
  tags: string[];
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
   * Single canonical description body. The May-2026 UX simplification
   * collapsed the previous trio (`summary` + `findings` + `diagnosis`)
   * into one field; this is the one to write going forward. Reads
   * should go through `getDescription()` in `lib/case-description.ts`,
   * which falls back to the legacy fields below for cases written
   * before the migration.
   *
   * Optional because the 326 imported cases pre-date the field — they
   * carry their text in `findings`. Once a backfill migration lands
   * (writes `description = findings || summary || diagnosis` for every
   * existing row) this can be promoted to `string` and the legacy
   * fields removed.
   */
  description?: string;
  /**
   * @deprecated Use `description` (write) and `getDescription(c)` (read).
   * Kept on the type because the imported corpus and any backups
   * predating May-2026 store their text here. New code should never
   * read or write this field directly.
   */
  findings: string;
  /**
   * @deprecated Use `description` (write) and `getDescription(c)` (read).
   * @see findings
   */
  diagnosis: string;
  /**
   * @deprecated Use `description` (write) and `getDescription(c)` (read).
   * @see findings
   */
  summary: string;
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
  focus?: {
    x?: number;
    y?: number;
    scale?: number;
  };
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
