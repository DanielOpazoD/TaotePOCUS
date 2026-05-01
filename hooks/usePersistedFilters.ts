"use client";

import { useEffect, useRef } from "react";
import { log } from "@/lib/log";
import type { SortOrder } from "@/lib/url";
import type { View } from "@/lib/types";

/**
 * Filter persistence between sessions (Tier-2 follow-up).
 *
 * The URL is the source of truth (`useViewState` keeps it that way),
 * but a hard reload of `/` shouldn't lose the filters the user was
 * holding when they closed the tab. This hook saves the current
 * filter set per-section to localStorage and, on mount, restores it
 * if the URL came back clean.
 *
 * Per-section persistence (key `pocus_filters:<section>`) avoids the
 * cross-section confusion where a "Cardíaco" filter from Atlas
 * survives a navigation to ECG (which doesn't have a Cardíaco
 * sidebar entry). Each section gets its own slot.
 *
 * Restore-once: the hook restores at most one time per mount, gated
 * by `view.kind` + `view.section` identity. Subsequent navigation
 * within the same section uses the URL state directly, never
 * fights it.
 *
 * Clear-aware: if the user clears all filters explicitly the empty
 * state writes back to storage, so the next visit lands on a clean
 * page rather than re-applying the previous filters.
 */
interface FilterState {
  cat: string | null;
  tags: string[];
  query: string;
  sort: SortOrder;
}

// Persisted shape is currently identical to the in-memory one.
// Aliased rather than declared as an empty `extends` interface so
// the lint rule (no-empty-object-type) stays happy; if the on-disk
// schema ever needs extra fields (e.g. `version`), this is the
// single edit point.
type PersistedFilters = FilterState;

const STORAGE_PREFIX = "pocus_filters:";
const VALID_SORT: SortOrder[] = ["recent", "title", "featured"];

function storageKey(view: View): string | null {
  if (view.kind !== "section") return null;
  return `${STORAGE_PREFIX}${view.section}`;
}

function isClean(state: FilterState): boolean {
  return (
    state.cat === null && state.tags.length === 0 && state.query === "" && state.sort === "recent"
  );
}

function readStored(key: string): PersistedFilters | null {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedFilters>;
    if (!parsed || typeof parsed !== "object") return null;
    // Defensive normalization. Storage might be stale (older shape,
    // hand-edited, dev tools fiddling). We accept anything well-typed
    // and normalize the rest to the empty default.
    return {
      cat: typeof parsed.cat === "string" ? parsed.cat : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === "string") : [],
      query: typeof parsed.query === "string" ? parsed.query : "",
      sort: VALID_SORT.includes(parsed.sort as SortOrder) ? (parsed.sort as SortOrder) : "recent",
    };
  } catch (err) {
    log.warn("filter-persistence read failed", { area: "filters" }, err);
    return null;
  }
}

function writeStored(key: string, state: FilterState): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (isClean(state)) {
      // Clean state → drop the slot so a future fresh tab loads
      // empty rather than restoring stale filters.
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(state));
    }
  } catch (err) {
    log.warn("filter-persistence write failed", { area: "filters" }, err);
  }
}

interface Args extends FilterState {
  view: View;
  /** URL patcher used to apply the restored filters silently. */
  replacePatch: (patch: {
    cat?: string | null;
    tags?: string[];
    query?: string;
    sort?: SortOrder;
  }) => void;
}

export function usePersistedFilters({ view, cat, tags, query, sort, replacePatch }: Args): void {
  // Track whether we've already restored for the current section so
  // a navigation within it doesn't trigger a second restore.
  const restoredForRef = useRef<string | null>(null);

  useEffect(() => {
    const key = storageKey(view);
    if (!key) {
      // Favs / admin views don't carry filters worth persisting.
      restoredForRef.current = null;
      return;
    }
    if (restoredForRef.current === key) {
      // Already restored on this mount-of-this-section. Subsequent
      // filter changes feed the write effect below, not a re-restore.
      return;
    }
    restoredForRef.current = key;
    // Only restore when the URL came in clean — never fight an
    // explicit deep-link.
    const current: FilterState = { cat, tags, query, sort };
    if (!isClean(current)) return;
    const stored = readStored(key);
    if (!stored || isClean(stored)) return;
    replacePatch({
      cat: stored.cat,
      tags: stored.tags,
      query: stored.query,
      sort: stored.sort,
    });
    // We intentionally depend on `view` only for the section identity.
    // The state inputs are read once at the moment we'd restore; later
    // changes feed the persistence write below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    const key = storageKey(view);
    if (!key) return;
    // Skip the first effect tick that fires before the restore above
    // had a chance to apply: if the section is freshly mounted AND
    // clean AND we haven't restored yet, this would write an empty
    // state, clearing the storage we were about to read from.
    if (restoredForRef.current !== key) return;
    writeStored(key, { cat, tags, query, sort });
  }, [view, cat, tags, query, sort]);
}
