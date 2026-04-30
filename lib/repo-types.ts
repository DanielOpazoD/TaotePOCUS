// Shared types for the repo layer. Lives outside `lib/repo.ts` so
// the per-backend modules under `lib/repo/` can import them without
// pulling the dispatch + public-API surface.

/**
 * Opaque pagination cursor. Treat as a string token. `null` is
 * "start from the beginning"; `undefined` in a query is the same.
 */
export type Cursor = string | null;

/** Result of a paged listing. */
export interface ListPagedResult<T> {
  /** The page of results. May be empty if the cursor is past the end. */
  items: T[];
  /** Cursor for the next page. `null` means "no more results". */
  nextCursor: Cursor;
  /** Total count, when the backend can answer cheaply. Optional —
   *  Firestore can't always provide this without a separate count query. */
  total?: number;
}

/**
 * Pagination query options. `limit` is required so the backend can
 * cap the page size; `cursor` is optional (omit / pass null for the
 * first page).
 */
export interface ListPagedOptions {
  cursor?: Cursor;
  limit: number;
}
