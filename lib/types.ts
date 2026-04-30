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
  findings: string;
  diagnosis: string;
  summary: string;
  featured?: boolean;
  /** Optional uploaded media. Absence (undefined) means "use the synthetic loop". */
  media?: Media;
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
   *   - `scale`: multiplier applied via `transform: scale(...)`. Range
   *     0.5–3, default 1. Below 1 leaves margin around the image
   *     inside the cell; above 1 crops in (zoom).
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
