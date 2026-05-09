// Pure-module tests for the saved-views helpers. Pins:
//   - `captureView` produces a `SavedView` whose `path` + `search`
//     round-trip the URL the user already sees.
//   - `viewHref` reassembles the URL.
//   - `normalizeSavedViews` drops malformed entries, clamps to
//     `MAX_SAVED_VIEWS`, and sorts most-recent first.

import { describe, expect, it } from "vitest";
import {
  MAX_SAVED_VIEWS,
  captureView,
  normalizeSavedViews,
  viewHref,
  type SavedView,
} from "@/lib/saved-views";
import type { ViewState } from "@/lib/url";

const baseState: ViewState = {
  view: { kind: "section", section: "atlas" },
  cat: null,
  tags: [],
  query: "",
  sort: "recent",
  caso: null,
  presenting: null,
  page: 0,
};

describe("captureView", () => {
  it("captures the section path with no search when filters are empty", () => {
    const view = captureView(baseState, "Atlas vacío");
    expect(view.path).toBe("/");
    expect(view.search).toBe("");
    expect(view.name).toBe("Atlas vacío");
    expect(view.id.length).toBeGreaterThan(0);
    expect(view.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("trims the name", () => {
    const view = captureView(baseState, "  with-padding  ");
    expect(view.name).toBe("with-padding");
  });

  it("captures cat / tags / query / sort into the search string", () => {
    const view = captureView(
      {
        ...baseState,
        cat: "cardiac",
        tags: ["B-líneas", "Patológico"],
        query: "tamponade",
        sort: "title",
      },
      "Mis cardíacos",
    );
    expect(view.path).toBe("/");
    // The exact key order is decided by URLSearchParams; assert on
    // contents rather than encoded shape.
    const params = new URLSearchParams(view.search);
    expect(params.get("cat")).toBe("cardiac");
    expect(params.get("tags")).toBe("B-líneas,Patológico");
    expect(params.get("q")).toBe("tamponade");
    expect(params.get("sort")).toBe("title");
  });

  it("captures the page param when non-zero", () => {
    const view = captureView({ ...baseState, page: 3 }, "Atlas page 4");
    const params = new URLSearchParams(view.search);
    // Page is 1-indexed in the URL; internal 0-indexed page=3 → ?page=4.
    expect(params.get("page")).toBe("4");
  });

  it("strips the modal slots — those are transient", () => {
    const view = captureView({ ...baseState, caso: "c-modal" }, "Should not save modal");
    expect(view.search).not.toContain("caso");
  });

  it("captures ECG section path", () => {
    const view = captureView(
      {
        ...baseState,
        view: { kind: "section", section: "ecg" },
      },
      "ECG",
    );
    expect(view.path).toBe("/ecg");
  });

  it("captures favs view", () => {
    const view = captureView(
      {
        ...baseState,
        view: { kind: "favs" },
      },
      "Mis favoritos",
    );
    expect(view.path).toBe("/favoritos");
  });
});

describe("viewHref", () => {
  it("returns the bare path when there's no search", () => {
    const view: SavedView = {
      id: "1",
      name: "x",
      path: "/atlas",
      search: "",
      createdAt: new Date().toISOString(),
    };
    expect(viewHref(view)).toBe("/atlas");
  });

  it("appends ? + search when present", () => {
    const view: SavedView = {
      id: "1",
      name: "x",
      path: "/",
      search: "cat=cardiac&sort=title",
      createdAt: new Date().toISOString(),
    };
    expect(viewHref(view)).toBe("/?cat=cardiac&sort=title");
  });
});

describe("normalizeSavedViews", () => {
  it("returns [] for non-array input", () => {
    expect(normalizeSavedViews(null)).toEqual([]);
    expect(normalizeSavedViews("not an array")).toEqual([]);
    expect(normalizeSavedViews({ length: 1 })).toEqual([]);
  });

  it("drops entries with missing / wrong-typed required fields", () => {
    const raw = [
      // valid
      { id: "1", name: "ok", path: "/", search: "", createdAt: "2026-05-01T00:00:00.000Z" },
      // missing id
      { name: "x", path: "/", search: "" },
      // empty name (trimmed)
      { id: "2", name: "   ", path: "/", search: "" },
      // path doesn't start with /
      { id: "3", name: "no-slash", path: "atlas", search: "" },
      // null entry
      null,
      // primitive entry
      "string",
    ];
    const out = normalizeSavedViews(raw);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("1");
  });

  it("orders most-recent first by createdAt", () => {
    const raw = [
      { id: "1", name: "old", path: "/", search: "", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "2", name: "new", path: "/", search: "", createdAt: "2026-05-01T00:00:00.000Z" },
      { id: "3", name: "mid", path: "/", search: "", createdAt: "2026-03-01T00:00:00.000Z" },
    ];
    const out = normalizeSavedViews(raw);
    expect(out.map((v) => v.id)).toEqual(["2", "3", "1"]);
  });

  it("clamps to MAX_SAVED_VIEWS and keeps the newest", () => {
    const raw = Array.from({ length: MAX_SAVED_VIEWS + 5 }, (_, i) => ({
      id: `id-${i}`,
      name: `view ${i}`,
      path: "/",
      search: "",
      // Older entries get smaller ISO timestamps.
      createdAt: new Date(2020, 0, 1 + i).toISOString(),
    }));
    const out = normalizeSavedViews(raw);
    expect(out).toHaveLength(MAX_SAVED_VIEWS);
    // Newest first → last input is at the head.
    expect(out[0]?.id).toBe(`id-${MAX_SAVED_VIEWS + 4}`);
  });

  it("provides a default createdAt when missing", () => {
    const raw = [{ id: "1", name: "x", path: "/", search: "" }];
    const out = normalizeSavedViews(raw);
    expect(out[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("trims the name on output", () => {
    const raw = [{ id: "1", name: "  spaced  ", path: "/", search: "" }];
    expect(normalizeSavedViews(raw)[0]?.name).toBe("spaced");
  });
});
