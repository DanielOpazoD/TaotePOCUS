export type SectionId = "atlas" | "ecg" | "cases" | "info";

export interface Section {
  id: SectionId;
  label: string;
  sub: string;
}

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
  id: CategoryId;
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

export type MediaKind = "video" | "image" | "gif" | "document";

export interface Media {
  kind: MediaKind;
  /**
   * URL the renderer can use directly. For files stored in Netlify Blobs
   * this points at `/.netlify/functions/media-serve?key=…`; for legacy
   * cases (or fallbacks) it can be a `data:` URL or any absolute URL.
   */
  src: string;
  /**
   * Blob storage key when the file lives in Netlify Blobs. Absent when
   * `src` is a data URL or external link, so the consumer can tell
   * "managed by us" from "embedded/external" without parsing the URL.
   */
  key?: string;
  /** Original filename, surfaced in the admin UI. */
  name?: string;
  /** MIME type as reported by the browser at upload time. */
  type?: string;
  /** Byte size of the original upload — useful for the admin file list. */
  size?: number;
  modality?: string;
}

export interface CaseRecord {
  id: string;
  section: SectionId;
  title: string;
  category: CategoryId;
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
