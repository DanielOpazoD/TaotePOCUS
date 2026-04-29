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
  caso: string | null;
  presenting: string | null;
}

const VALID_SECTIONS: SectionId[] = ["atlas", "ecg", "cases", "info"];
const VALID_SORT: SortOrder[] = ["recent", "title", "featured"];

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
  const caso = params.get("caso") || null;
  const presenting = params.get("present") || null;

  return { view, cat, tags, query, sort, caso, presenting };
}

export type ViewPatch = Partial<{
  view: View;
  cat: string | null;
  tags: string[];
  query: string;
  sort: SortOrder;
  caso: string | null;
  presenting: string | null;
}>;

/**
 * Build the search-param portion of the next URL. The pathname is the
 * caller's responsibility (computed via `viewToPath`).
 *
 * When the view changes, cat/tags are dropped — they are section-
 * specific and would land the user on a likely-empty grid.
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
  if (patch.caso !== undefined) set("caso", patch.caso);
  if (patch.presenting !== undefined) set("present", patch.presenting);
  return sp;
}
