// Types shared between `BulkEditTable` and its subcomponents. Kept
// in a tiny module so the cells can depend on the contracts without
// pulling the orchestrator's full file in. The columns the user
// can click to sort by — narrowed to a literal union so a typo at
// the call site is a compile error instead of a silent no-op.
export type SortField = "title" | "description" | "category" | "reviewed" | null;
export type SortDir = "asc" | "desc";
