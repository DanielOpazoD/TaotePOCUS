// Tests for `useRecentlyViewed`. The hook persists a most-recent-
// first list of case ids in localStorage so the favoritos page can
// render a "continue where I left off" rail above the grid.
//
// Contract bullets:
//   1. Initial state reads from localStorage and clamps to MAX.
//   2. `add(id)` pushes to the front, dedupes, caps at MAX.
//   3. `cases` resolves ids against the supplied catalog, dropping
//      purged ids and excluding `currentId`.
//   4. Cross-tab `storage` events refresh the list.
//   5. `clear()` wipes both state and storage.

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useRecentlyViewed, MAX_RECENTLY_VIEWED } from "@/hooks/useRecentlyViewed";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { CaseRecord } from "@/lib/types";

function makeCase(id: string, extra: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id,
    section: extra.section ?? "atlas",
    title: extra.title ?? { es: id },
    category: extra.category ?? "cardiac",
    tags: extra.tags ?? { es: [] },
    modality: extra.modality ?? "",
    loop: extra.loop ?? "blines",
    author: extra.author ?? "Admin",
    role: extra.role ?? "Admin",
    date: extra.date ?? "2026-01-01",
    description: extra.description ?? { es: "" },
    featured: extra.featured ?? false,
    ...extra,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("useRecentlyViewed", () => {
  it("starts empty when storage is empty", () => {
    const { result } = renderHook(() => useRecentlyViewed([]));
    expect(result.current.ids).toEqual([]);
    expect(result.current.cases).toEqual([]);
  });

  it("hydrates from storage on mount", () => {
    localStorage.setItem(STORAGE_KEYS.recentlyViewed, JSON.stringify(["c3", "c1", "c2"]));
    const cases = [makeCase("c1"), makeCase("c2"), makeCase("c3")];
    const { result } = renderHook(() => useRecentlyViewed(cases));
    expect(result.current.ids).toEqual(["c3", "c1", "c2"]);
    expect(result.current.cases.map((c) => c.id)).toEqual(["c3", "c1", "c2"]);
  });

  it("ignores garbage in storage (non-array, non-strings) and clamps length", () => {
    const tooMany = Array.from({ length: MAX_RECENTLY_VIEWED + 5 }, (_, i) => `c${i}`);
    localStorage.setItem(
      STORAGE_KEYS.recentlyViewed,
      JSON.stringify([...tooMany, 42, null, undefined]),
    );
    const { result } = renderHook(() => useRecentlyViewed([]));
    expect(result.current.ids).toHaveLength(MAX_RECENTLY_VIEWED);
    expect(result.current.ids.every((id) => typeof id === "string")).toBe(true);
  });

  it("add() pushes to the front and dedupes existing entries", () => {
    const cases = [makeCase("c1"), makeCase("c2"), makeCase("c3")];
    const { result } = renderHook(() => useRecentlyViewed(cases));
    act(() => {
      result.current.add("c1");
      result.current.add("c2");
      result.current.add("c1"); // bump c1 to the front
    });
    expect(result.current.ids).toEqual(["c1", "c2"]);
  });

  it("add() caps the list at MAX_RECENTLY_VIEWED", () => {
    const { result } = renderHook(() => useRecentlyViewed([]));
    act(() => {
      for (let i = 0; i < MAX_RECENTLY_VIEWED + 5; i += 1) {
        result.current.add(`c${i}`);
      }
    });
    expect(result.current.ids).toHaveLength(MAX_RECENTLY_VIEWED);
    // Most-recent first → the LAST id added sits at the head.
    expect(result.current.ids[0]).toBe(`c${MAX_RECENTLY_VIEWED + 4}`);
  });

  it("cases drops ids that no longer resolve in the catalog", () => {
    // c2 has been purged — id stays in storage but the resolved
    // cases list silently drops it.
    localStorage.setItem(STORAGE_KEYS.recentlyViewed, JSON.stringify(["c1", "c2", "c3"]));
    const cases = [makeCase("c1"), makeCase("c3")];
    const { result } = renderHook(() => useRecentlyViewed(cases));
    expect(result.current.cases.map((c) => c.id)).toEqual(["c1", "c3"]);
  });

  it("cases excludes the `currentId` so the rail doesn't echo the open modal", () => {
    localStorage.setItem(STORAGE_KEYS.recentlyViewed, JSON.stringify(["c1", "c2", "c3"]));
    const cases = [makeCase("c1"), makeCase("c2"), makeCase("c3")];
    const { result } = renderHook(() => useRecentlyViewed(cases, "c2"));
    expect(result.current.cases.map((c) => c.id)).toEqual(["c1", "c3"]);
  });

  it("clear() wipes state and storage", () => {
    localStorage.setItem(STORAGE_KEYS.recentlyViewed, JSON.stringify(["c1", "c2"]));
    const { result } = renderHook(() => useRecentlyViewed([makeCase("c1")]));
    expect(result.current.ids).toHaveLength(2);
    act(() => {
      result.current.clear();
    });
    expect(result.current.ids).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS.recentlyViewed)).toBeNull();
  });

  it("syncs across tabs via the storage event", () => {
    const cases = [makeCase("c1"), makeCase("c2")];
    const { result } = renderHook(() => useRecentlyViewed(cases));
    expect(result.current.ids).toEqual([]);
    // Simulate another tab writing to the same slot.
    act(() => {
      localStorage.setItem(STORAGE_KEYS.recentlyViewed, JSON.stringify(["c2", "c1"]));
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.recentlyViewed }));
    });
    expect(result.current.ids).toEqual(["c2", "c1"]);
  });
});
