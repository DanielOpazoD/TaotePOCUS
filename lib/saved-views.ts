// Saved views — named bundles of filter state the user can recall
// with one click. The catalog has 5 sections, ~10 categories, ~80
// tags, full-text search and sort order: assembling the right
// combination is real work. Saving "Mis cardíacos sin revisar" or
// "Trauma esta semana" lets the user (admin or reader) skip the
// assembly on every visit.
//
// Why not just bookmark the URL: bookmarks live in the browser and
// don't survive cleared history; saved views live in `localStorage`
// and survive across sessions. They also sync cross-tab (via the
// existing `BroadcastChannel` topic), so saving in one tab makes
// the view available in any other tab of the same origin.
//
// Pure module — no React, no DOM. The CRUD lives in
// `hooks/useSavedViews.ts`; the UI dropdown in
// `components/chrome/SavedViewsMenu.tsx`.

import { applyViewPatch, viewToPath, type ViewState } from "./url";

/**
 * One saved view. The shape is intentionally small + JSON-friendly
 * so the persistence layer is just `JSON.stringify`. `path` and
 * `search` are kept separate so a future migration that touches the
 * URL grammar can rewrite one or the other without breaking the
 * other (e.g. promoting `?cat=` to a path segment).
 */
export interface SavedView {
  /** Stable id. Used as React key + as the dropdown row id for
   *  delete actions. UUID-style for collision freedom. */
  id: string;
  /** User-typed display name. Shown in the dropdown row. */
  name: string;
  /** URL pathname (e.g. `"/atlas"`, `"/ecg"`, `"/favoritos"`). */
  path: string;
  /** URL search-string portion WITHOUT the leading `?`. Empty
   *  string when the view has no filters (a bare section). */
  search: string;
  /** ISO timestamp of creation. Used by the dropdown to display a
   *  "saved 3 days ago" hint and by the migration code to age out
   *  views that were never used. */
  createdAt: string;
}

/** Maximum number of saved views per browser. Kept generous but
 *  bounded so a runaway loop / pranky user can't fill localStorage
 *  with thousands of entries. The dropdown is ordered most-recent
 *  first; entries past the cap drop the OLDEST. */
export const MAX_SAVED_VIEWS = 30;

/**
 * Build a `SavedView` from the current view state. Used by the
 * "Save current" action — the hook reads `useViewState` then calls
 * this to produce the persisted shape.
 *
 * The implementation reuses `viewToPath` + `applyViewPatch` from
 * `lib/url.ts` so the captured search string is byte-identical to
 * what the user already sees in the address bar (modulo `lang=`,
 * which we strip — the view doesn't carry the user's UI language).
 */
export function captureView(state: ViewState, name: string): SavedView {
  const path = viewToPath(state.view);
  // Reconstruct the search string by feeding every field of the
  // ViewState through `applyViewPatch`. The `lang` query param
  // (managed independently by `useLanguage`) does NOT enter the
  // saved view — sharing is intent-preserving, not language-locking.
  const params = new URLSearchParams();
  const next = applyViewPatch(params, {
    view: state.view,
    cat: state.cat,
    tags: state.tags,
    query: state.query,
    sort: state.sort,
    difficulty: state.difficulty,
    // Modal slots (`caso`, `presenting`) are transient — saving
    // them would re-open a modal the user already closed.
    page: state.page,
  });
  return {
    id: generateId(),
    name: name.trim(),
    path,
    search: next.toString(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * URL string ready to navigate to. Combines `path` + `?search` (when
 * non-empty). Consumers pass this to `router.push` / a regular `<a
 * href>`.
 */
export function viewHref(view: SavedView): string {
  return view.search ? `${view.path}?${view.search}` : view.path;
}

/** UUID-ish id. Uses `crypto.randomUUID` when available, falls
 *  back to a base36 timestamp+random pair so SSR / older shells
 *  don't crash. Collision risk is negligible for the scale (~30
 *  entries per browser). */
function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Defensive deserializer. Drops malformed entries and clamps the
 * total at `MAX_SAVED_VIEWS`. Idempotent — running on already-clean
 * data returns the same array.
 */
export function normalizeSavedViews(raw: unknown): SavedView[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedView[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.id !== "string" || obj.id.length === 0) continue;
    if (typeof obj.name !== "string" || obj.name.trim().length === 0) continue;
    if (typeof obj.path !== "string" || !obj.path.startsWith("/")) continue;
    const search = typeof obj.search === "string" ? obj.search : "";
    const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : new Date().toISOString();
    out.push({
      id: obj.id,
      name: obj.name.trim(),
      path: obj.path,
      search,
      createdAt,
    });
  }
  // Most-recent first. Stable sort across mounts so the dropdown
  // order doesn't shuffle on every reload.
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out.slice(0, MAX_SAVED_VIEWS);
}
