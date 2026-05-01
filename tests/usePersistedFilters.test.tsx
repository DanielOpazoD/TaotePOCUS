// Tests for `usePersistedFilters`. The hook saves the active
// filter set (cat / tags / query / sort) per-section to localStorage
// and restores it the next time the URL lands "clean" on the same
// section. The four contract bullets:
//
//   1. Clean-URL mount with stored filters → replacePatch fires.
//   2. Dirty-URL mount → no restore (URL deep-link wins).
//   3. Filter changes → write to storage.
//   4. Cleared filters → storage slot dropped.

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import type { View } from "@/lib/types";

const SECTION_KEY = "pocus_filters:atlas";
const SECTION_VIEW: View = { kind: "section", section: "atlas" };

beforeEach(() => {
  localStorage.clear();
});

describe("usePersistedFilters", () => {
  it("restores stored filters when the URL lands clean on the section", () => {
    localStorage.setItem(
      SECTION_KEY,
      JSON.stringify({ cat: "cardiac", tags: ["B-líneas"], query: "tampon", sort: "title" }),
    );
    const replacePatch = vi.fn();
    renderHook(() =>
      usePersistedFilters({
        view: SECTION_VIEW,
        cat: null,
        tags: [],
        query: "",
        sort: "recent",
        replacePatch,
      }),
    );
    expect(replacePatch).toHaveBeenCalledTimes(1);
    expect(replacePatch).toHaveBeenCalledWith({
      cat: "cardiac",
      tags: ["B-líneas"],
      query: "tampon",
      sort: "title",
    });
  });

  it("does NOT restore when the URL already carries filters (deep-link wins)", () => {
    localStorage.setItem(
      SECTION_KEY,
      JSON.stringify({ cat: "cardiac", tags: [], query: "", sort: "recent" }),
    );
    const replacePatch = vi.fn();
    renderHook(() =>
      usePersistedFilters({
        view: SECTION_VIEW,
        cat: "lung", // URL says lung — leave it alone.
        tags: [],
        query: "",
        sort: "recent",
        replacePatch,
      }),
    );
    expect(replacePatch).not.toHaveBeenCalled();
  });

  it("writes the current filter state to storage on filter changes", () => {
    const replacePatch = vi.fn();
    const { rerender } = renderHook(
      (props: Parameters<typeof usePersistedFilters>[0]) => usePersistedFilters(props),
      {
        initialProps: {
          view: SECTION_VIEW,
          cat: null,
          tags: [],
          query: "",
          sort: "recent",
          replacePatch,
        },
      },
    );
    // Apply a filter (simulating the user clicking a category).
    rerender({
      view: SECTION_VIEW,
      cat: "cardiac",
      tags: ["B-líneas"],
      query: "",
      sort: "recent",
      replacePatch,
    });
    const stored = JSON.parse(localStorage.getItem(SECTION_KEY) ?? "null");
    expect(stored).toEqual({
      cat: "cardiac",
      tags: ["B-líneas"],
      query: "",
      sort: "recent",
    });
  });

  it("drops the storage slot when the user clears filters back to default", () => {
    localStorage.setItem(
      SECTION_KEY,
      JSON.stringify({ cat: "cardiac", tags: [], query: "", sort: "recent" }),
    );
    const replacePatch = vi.fn();
    const { rerender } = renderHook(
      (props: Parameters<typeof usePersistedFilters>[0]) => usePersistedFilters(props),
      {
        initialProps: {
          view: SECTION_VIEW,
          cat: "cardiac",
          tags: [],
          query: "",
          sort: "recent",
          replacePatch,
        },
      },
    );
    // First run restored from storage (no-op since URL had filters);
    // now the user clears them.
    rerender({
      view: SECTION_VIEW,
      cat: null,
      tags: [],
      query: "",
      sort: "recent",
      replacePatch,
    });
    expect(localStorage.getItem(SECTION_KEY)).toBeNull();
  });

  it("doesn't persist favs / admin views (no filter slot)", () => {
    const replacePatch = vi.fn();
    renderHook(() =>
      usePersistedFilters({
        view: { kind: "favs" },
        cat: "cardiac",
        tags: [],
        query: "",
        sort: "recent",
        replacePatch,
      }),
    );
    expect(localStorage.getItem("pocus_filters:favs")).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("falls back to defaults on a corrupt storage entry", () => {
    localStorage.setItem(SECTION_KEY, "not-json{{{");
    const replacePatch = vi.fn();
    renderHook(() =>
      usePersistedFilters({
        view: SECTION_VIEW,
        cat: null,
        tags: [],
        query: "",
        sort: "recent",
        replacePatch,
      }),
    );
    // Doesn't throw; doesn't restore (parse failed → null → no patch).
    expect(replacePatch).not.toHaveBeenCalled();
  });
});
