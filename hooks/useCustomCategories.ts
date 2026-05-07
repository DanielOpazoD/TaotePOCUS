"use client";

// Public composing hook for the categories feature. Glues two
// focused sub-hooks together so the call sites get one return shape:
//
//   - `useCustomCategoriesData` — CRUD + DB hydration + merge with
//     built-ins.
//   - `useCategoryVisibility`   — per-id hidden flag.
//
// Splitting these in May-2026 dropped the previous monolith from
// 280 LOC of mixed concerns to two ~100-LOC modules with one
// responsibility each. The public API of `useCustomCategories` is
// unchanged so existing call sites (App, AdminPanel, sidebar)
// don't move.

import { useMemo } from "react";
import { useCategoryVisibility } from "./useCategoryVisibility";
import { useCustomCategoriesData } from "./useCustomCategoriesData";
import type { Category } from "@/lib/types";

export function useCustomCategories() {
  const data = useCustomCategoriesData();
  const visibility = useCategoryVisibility();

  // Filtered list used by public surfaces (sidebar, hero, etc.).
  // Admin views still get the full `categories` so the editor can
  // toggle visibility on hidden ones.
  const visibleCategories = useMemo<Category[]>(
    () => data.categories.filter((c) => !visibility.hiddenSet.has(c.id)),
    [data.categories, visibility.hiddenSet],
  );

  return {
    customCategories: data.customCategories,
    /** Built-in + custom (full set, including hidden). Use this in
     *  the Categories editor where the admin manages visibility. */
    categories: data.categories,
    /** Built-in + custom MINUS hidden ones. Use this in public-
     *  facing surfaces (sidebar nav, hero, classifier dropdowns). */
    visibleCategories,
    addCategory: data.addCategory,
    renameCategory: data.renameCategory,
    removeCategory: data.removeCategory,
    /** Inverse of `removeCategory`. Used by the undo toast path. */
    restoreCategory: data.restoreCategory,
    isCustom: data.isCustom,
    /** Predicate: is this category currently hidden from the public
     *  Atlas POCUS view? */
    isHidden: visibility.isHidden,
    /** Toggle visibility. Pass `hidden: true` to hide, `false` to
     *  show. Works for both built-in and custom categories. */
    setHidden: visibility.setHidden,
  };
}
