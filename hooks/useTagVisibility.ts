"use client";

// Per-tag visibility toggle. The admin can mark any tag as "hidden":
// the tag stays on every case's `tags` array (no destructive mutation
// of the seed corpus), but every consuming surface filters it out —
// sidebar tag cloud, the tag explorer modal (public view),
// `.case-tag-mini` chip strip on cards, `.tag-chip` chips inside the
// case modal. The admin can restore the tag from the explorer's
// "Etiquetas ocultas" section at any time. Persists locally;
// travels with the backup envelope so a deploy carries the hide list.
//
// Mirrors the `useCategoryVisibility` pattern (see comment in that
// hook for the broader design rationale). Same shape so consumers
// can pass through whichever predicate they need without learning a
// new API.

import { useCallback, useMemo } from "react";
import { usePersistedState } from "./usePersistedState";
import { STORAGE_KEYS } from "@/lib/storage-keys";

const STORAGE_KEY = STORAGE_KEYS.hiddenTags;

export interface UseTagVisibilityResult {
  /** Predicate — is this tag currently hidden? */
  isHidden: (tag: string) => boolean;
  /** Toggle. `hidden: true` adds to the hidden set; `false` restores
   *  the tag (removes it from the hidden list). */
  setHidden: (tag: string, hidden: boolean) => void;
  /** Set of hidden tags — useful for memoized filters. New Set
   *  reference per change so downstream `useMemo`s pick it up. */
  hiddenSet: Set<string>;
  /** Sorted list of currently-hidden tags. Convenience for the
   *  admin "Etiquetas ocultas" review panel. */
  hiddenList: string[];
  /** Restore every hidden tag at once. Used by the explorer's
   *  "restaurar todas" action. */
  clear: () => void;
}

export function useTagVisibility(): UseTagVisibilityResult {
  const [hiddenTags, setHiddenTags] = usePersistedState<string[]>(STORAGE_KEY, [], {
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

  const hiddenSet = useMemo(() => new Set(hiddenTags), [hiddenTags]);
  const hiddenList = useMemo(
    () => [...hiddenTags].sort((a, b) => a.localeCompare(b)),
    [hiddenTags],
  );
  const isHidden = useCallback((tag: string) => hiddenSet.has(tag), [hiddenSet]);
  const setHidden = useCallback(
    (tag: string, hidden: boolean) => {
      setHiddenTags((prev) => {
        const set = new Set(prev);
        if (hidden) set.add(tag);
        else set.delete(tag);
        return Array.from(set);
      });
    },
    [setHiddenTags],
  );
  const clear = useCallback(() => setHiddenTags([]), [setHiddenTags]);

  return { isHidden, setHidden, hiddenSet, hiddenList, clear };
}
