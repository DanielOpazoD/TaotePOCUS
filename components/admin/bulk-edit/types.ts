// Types shared between `BulkEditTable` and its subcomponents. Kept
// in a tiny module so the cells can depend on the contracts without
// pulling the orchestrator's full file in. The columns the user
// can click to sort by — narrowed to a literal union so a typo at
// the call site is a compile error instead of a silent no-op.
export type SortField = "title" | "description" | "category" | "reviewed" | null;
export type SortDir = "asc" | "desc";

/**
 * "Estado IA" filter. Drives the new dropdown in `BulkEditFilters`
 * that lets the admin narrow to cases the AI has touched.
 *
 *   - "all"           — no narrowing (default).
 *   - "no-ai"         — `translationMeta` is undefined or
 *                       `aiGenerated === false`. Cases written by
 *                       hand.
 *   - "ai-pending"    — `aiGenerated && !reviewedAt`. Cases the
 *                       admin auto-saved via the rewrite modal but
 *                       hasn't yet validated by eye.
 *   - "ai-reviewed"   — `aiGenerated && reviewedAt`. Cases the
 *                       admin AI-generated AND explicitly accepted
 *                       in the review modal (or marked as reviewed
 *                       later).
 */
export type AIStatusFilter = "all" | "no-ai" | "ai-pending" | "ai-reviewed";
