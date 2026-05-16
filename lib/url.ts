// Pure URL <-> view-state translation. Tested in isolation in
// __tests__/url.test.ts. The hook in `useViewState` is the React-side
// adapter; this module keeps the parsing logic free of React imports
// so the conversion is unit-testable and reusable on the server.

import type { SectionId, View } from "./types";

/**
 * Order of the case grid. `recent` is the default — featured cases get
 * their own row at the top of section views.
 */
export type SortOrder = "recent" | "title" | "featured";

/**
 * Difficulty filter slot. Multi-select: empty array means "any
 * difficulty" (no filter applied); a non-empty list keeps cases whose
 * declared difficulty is in the set. Cases without an explicit
 * `difficulty` field are treated as `"intermediate"` at filter time —
 * matches the modal pill default in `lib/case-meta.ts > difficultyLabel`.
 */
export type Difficulty = "basic" | "intermediate" | "advanced";

/**
 * Parsed view state for the current URL. The hook `useViewState` wraps
 * this with React glue; the pure shape lives here so server code and
 * tests can use it without importing React.
 */
export interface ViewState {
  view: View;
  cat: string | null;
  tags: string[];
  query: string;
  sort: SortOrder;
  /** Difficulty levels currently active in the toolbar. Empty = no
   *  filter. See {@link Difficulty}. */
  difficulty: Difficulty[];
  caso: string | null;
  presenting: string | null;
  /** 0-indexed catalog page. The grid renders pageSize cases per
   *  page (~30); this drives "next/prev" navigation. The param is
   *  cleared (back to 0) on any filter change so the user doesn't
   *  land on page 7 of a 1-page result set. */
  page: number;
}

const VALID_SECTIONS: SectionId[] = ["atlas", "ecg", "cases", "info", "rayos"];
const VALID_SORT: SortOrder[] = ["recent", "title", "featured"];
const VALID_DIFFICULTY: Difficulty[] = ["basic", "intermediate", "advanced"];

/** Map a pathname to a View. Anything unknown falls back to atlas. */
export function pathToView(pathname: string): View {
  const seg = pathname.replace(/^\/+/, "").split("/")[0] || "";
  if (seg === "favoritos") return { kind: "favs" };
  if (seg === "admin") return { kind: "admin" };
  if (VALID_SECTIONS.includes(seg as SectionId)) {
    return { kind: "section", section: seg as SectionId };
  }
  return { kind: "section", section: "atlas" };
}

/** Inverse of pathToView. Used by the navigation builder. */
export function viewToPath(view: View): string {
  if (view.kind === "favs") return "/favoritos";
  if (view.kind === "admin") return "/admin";
  return view.section === "atlas" ? "/" : `/${view.section}`;
}

/**
 * Combine the path and search params into a fully-resolved `ViewState`.
 * Pure: no DOM, no React, suitable for server-side rendering or tests.
 *
 * Defensive: unknown sections fall back to atlas, malformed sort
 * values fall back to `"recent"`, missing tags becomes `[]`. The
 * caller can always trust the returned shape.
 */
export function parseViewState(pathname: string, params: URLSearchParams): ViewState {
  const view = pathToView(pathname);

  const cat = params.get("cat") || null;
  const tags = (params.get("tags") || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const query = params.get("q") || "";
  const sortParam = params.get("sort") as SortOrder | null;
  const sort = sortParam && VALID_SORT.includes(sortParam) ? sortParam : "recent";
  // Difficulty is comma-separated for shareable URLs. Each token is
  // validated against the allow-list so a hand-edited `?difficulty=foo`
  // is ignored instead of poisoning the filter (defensive; same
  // discipline as the sort fallback above).
  const difficulty = (params.get("difficulty") || "")
    .split(",")
    .map((t) => t.trim())
    .filter((t): t is Difficulty => VALID_DIFFICULTY.includes(t as Difficulty));
  const caso = params.get("caso") || null;
  const presenting = params.get("present") || null;
  // `page` is 1-indexed in the URL (`?page=2`) for human-readable
  // sharing, but exposed as 0-indexed throughout the React tree
  // (matches BulkEditTable's existing local state). Decrement on
  // parse, increment on serialize. Defensive: invalid / negative
  // values fall back to page 0.
  const pageParam = parseInt(params.get("page") || "1", 10);
  const page = Number.isFinite(pageParam) && pageParam > 1 ? pageParam - 1 : 0;

  return { view, cat, tags, query, sort, difficulty, caso, presenting, page };
}

export type ViewPatch = Partial<{
  view: View;
  cat: string | null;
  tags: string[];
  query: string;
  sort: SortOrder;
  difficulty: Difficulty[];
  caso: string | null;
  presenting: string | null;
  /** 0-indexed page. Setting `0` removes the URL param (clean
   *  shareable URLs default to page 1). */
  page: number;
}>;

/**
 * Build the search-param portion of the next URL. The pathname is the
 * caller's responsibility (computed via `viewToPath`).
 *
 * When the view changes, cat/tags are dropped — they are section-
 * specific and would land the user on a likely-empty grid.
 *
 * Filter-changing patches (`view`, `cat`, `tags`, `query`, `sort`)
 * also implicitly drop `page` back to 0 — landing on page 7 of a
 * 1-page result is worse than landing on page 1. Callers can
 * explicitly pass `page` in the same patch to override (e.g. a
 * deep-link that arrives with `?cat=lung&page=2`).
 */
export function applyViewPatch(prev: URLSearchParams, patch: ViewPatch): URLSearchParams {
  const sp = new URLSearchParams(prev.toString());
  const set = (key: string, value: string | null | undefined) => {
    if (value == null || value === "") sp.delete(key);
    else sp.set(key, value);
  };

  if (patch.view !== undefined) {
    sp.delete("cat");
    sp.delete("tags");
  }
  if (patch.cat !== undefined) set("cat", patch.cat);
  if (patch.tags !== undefined) set("tags", patch.tags.length ? patch.tags.join(",") : null);
  if (patch.query !== undefined) set("q", patch.query);
  if (patch.sort !== undefined) set("sort", patch.sort === "recent" ? null : patch.sort);
  if (patch.difficulty !== undefined)
    set("difficulty", patch.difficulty.length ? patch.difficulty.join(",") : null);
  if (patch.caso !== undefined) set("caso", patch.caso);
  if (patch.presenting !== undefined) set("present", patch.presenting);

  // Implicit reset: any filter change drops the page param unless
  // the caller passed `page` explicitly in the same patch.
  const isFilterPatch =
    patch.view !== undefined ||
    patch.cat !== undefined ||
    patch.tags !== undefined ||
    patch.query !== undefined ||
    patch.sort !== undefined ||
    patch.difficulty !== undefined;
  if (patch.page !== undefined) {
    // Page is 1-indexed in URLs (human-readable); 0 → no param.
    set("page", patch.page > 0 ? String(patch.page + 1) : null);
  } else if (isFilterPatch) {
    sp.delete("page");
  }
  return sp;
}
