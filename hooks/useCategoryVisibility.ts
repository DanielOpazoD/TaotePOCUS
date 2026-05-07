"use client";

// Per-category visibility toggle. The admin can mark any category
// (built-in or custom) as "hidden": it stays in the catalog (cases
// keep their assignment) but doesn't appear in the public sidebar
// nav rail. Useful for trimming surfaces when a built-in like
// "Obstétrico" has very few cases the admin doesn't want to expose
// publicly.
//
// Lifted out of `useCustomCategories` in May-2026 as part of the
// hook decomposition: the previous monolith mixed CRUD, hydration,
// merging AND visibility. Each is now its own focused module so a
// reader doesn't have to scan 280 LOC to understand the visibility
// contract.
//
// Persistence: a `string[]` of hidden ids in localStorage. A
// non-string entry in the deserialized array is dropped defensively
// so a corrupt entry doesn't crash the editor.

import { useCallback, useMemo } from "react";
import { usePersistedState } from "./usePersistedState";

const STORAGE_KEY = "hiddenCategoryIds";

export interface UseCategoryVisibilityResult {
  /** Predicate — is this id currently hidden? */
  isHidden: (id: string) => boolean;
  /** Toggle. `hidden: true` adds to the hidden set; `false` removes. */
  setHidden: (id: string, hidden: boolean) => void;
  /** Set of hidden ids — useful for memoized filters. */
  hiddenSet: Set<string>;
}

export function useCategoryVisibility(): UseCategoryVisibilityResult {
  const [hiddenIds, setHiddenIds] = usePersistedState<string[]>(STORAGE_KEY, [], {
    deserialize: (raw) => {
      try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return undefined;
        return arr.filter((x): x is string => typeof x === "string" && x.length > 0);
      } catch {
        return undefined;
      }
    },
  });

  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const isHidden = useCallback((id: string) => hiddenSet.has(id), [hiddenSet]);
  const setHidden = useCallback(
    (id: string, hidden: boolean) => {
      setHiddenIds((prev) => {
        const set = new Set(prev);
        if (hidden) set.add(id);
        else set.delete(id);
        return Array.from(set);
      });
    },
    [setHiddenIds],
  );

  return { isHidden, setHidden, hiddenSet };
}
