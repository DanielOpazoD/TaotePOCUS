"use client";

// CRUD + persistence + cross-tab sync for saved views (named
// filter presets). Counterpart to `lib/saved-views.ts` (pure
// helpers); this hook owns the React state + localStorage + the
// `BroadcastChannel` integration so the consumer surface stays
// small.
//
// Why client-side only: the views capture the user's specific
// catalog browsing state (tags, search query, sort). They're not
// shared and don't need to round-trip through the DB. If we later
// want shared "team views" we promote the storage layer to the
// repo facade — the hook surface stays the same.

import { useCallback, useEffect } from "react";
import { usePersistedState } from "./usePersistedState";
import { useCrossTabSync } from "./useCrossTabSync";
import {
  MAX_SAVED_VIEWS,
  captureView,
  normalizeSavedViews,
  type SavedView,
} from "@/lib/saved-views";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { ViewState } from "@/lib/url";

const STORAGE_KEY = STORAGE_KEYS.savedViews;

export interface UseSavedViewsResult {
  /** Most-recent first, capped at `MAX_SAVED_VIEWS`. */
  views: SavedView[];
  /**
   * Persist the current `ViewState` under `name`. Returns the
   * created view, or `null` if the name was empty after trimming.
   * If the cap is reached the oldest entry is dropped to make room.
   */
  saveCurrent: (state: ViewState, name: string) => SavedView | null;
  /** Drop a single view by id. */
  removeView: (id: string) => void;
  /** Update the display name of an existing view. Empty strings
   *  are ignored (the previous name stays). */
  renameView: (id: string, name: string) => void;
}

export function useSavedViews(): UseSavedViewsResult {
  const [views, setViews] = usePersistedState<SavedView[]>(STORAGE_KEY, [], {
    deserialize: (raw) => {
      try {
        return normalizeSavedViews(JSON.parse(raw));
      } catch {
        return undefined;
      }
    },
  });

  // Cross-tab sync. Saving a view in one tab refreshes the dropdown
  // in any other open tab of the same origin. The listener re-reads
  // localStorage rather than carrying the array in the message — the
  // payload is small but `BroadcastChannel` events should stay
  // metadata-only by convention so we don't accidentally re-broadcast
  // huge state across tabs.
  const publish = useCrossTabSync("saved-views", () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setViews(raw ? normalizeSavedViews(JSON.parse(raw)) : []);
    } catch {
      /* ignore — corrupt JSON falls back to current state */
    }
  });

  const saveCurrent = useCallback(
    (state: ViewState, name: string): SavedView | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const next = captureView(state, trimmed);
      setViews((prev) => {
        // Drop oldest when at the cap. The list is already sorted
        // most-recent first, so slicing from the front keeps the
        // user's recent presets and ages out the long-untouched ones.
        const merged = [next, ...prev].slice(0, MAX_SAVED_VIEWS);
        return merged;
      });
      publish();
      return next;
    },
    [setViews, publish],
  );

  const removeView = useCallback(
    (id: string) => {
      setViews((prev) => prev.filter((v) => v.id !== id));
      publish();
    },
    [setViews, publish],
  );

  const renameView = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setViews((prev) => prev.map((v) => (v.id === id ? { ...v, name: trimmed } : v)));
      publish();
    },
    [setViews, publish],
  );

  // Touch the views once on mount so a `BroadcastChannel` listener
  // fires before any consumer reads — useful when two tabs open
  // simultaneously and one already has data.
  useEffect(() => {
    /* sync with the storage layer happens on first read of usePersistedState */
  }, []);

  return { views, saveCurrent, removeView, renameView };
}
