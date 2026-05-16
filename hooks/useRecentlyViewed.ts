"use client";

// "Recently viewed" trail. Each time the case modal opens, the case
// id is appended to a localStorage list (most-recent first, deduped,
// capped). The favs page renders the resolved list above the grid
// so a reader who hasn't favorited anything yet still has a
// "continue where I left off" thread.
//
// Why localStorage (not a session call): the trail is per-device and
// per-browser. A reader who clicks through 15 cases on their phone
// shouldn't see those entries pollute their desktop trail, and we
// don't want yet another sync surface. The list is small (≤12 ids)
// so storage cost is trivial.
//
// Why an array of ids (not full case records): the case catalog
// already lives in memory via `useMergedCatalog`. Storing just the
// ids keeps the trail durable across catalog re-imports — when a
// case id stops resolving (rare: hard-delete via `purged`), we just
// drop it from the rendered list. Storage stays tiny.

import { useCallback, useEffect, useMemo, useState } from "react";
import { log } from "@/lib/log";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { CaseRecord } from "@/lib/types";

/** Maximum ids kept in the trail. Tuned to fit on a single mobile
 *  rail row (~8) plus a buffer; older entries fall off the tail.
 *  Big enough to feel useful, small enough that no realistic
 *  re-render works against it. */
export const MAX_RECENTLY_VIEWED = 12;

function readStored(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.recentlyViewed);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Defensive filter — storage may be hand-edited or partially
    // upgraded. Drop non-strings and clamp the length.
    return parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENTLY_VIEWED);
  } catch (err) {
    log.warn("recently-viewed read failed", { area: "recently-viewed" }, err);
    return [];
  }
}

function writeStored(ids: string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (ids.length === 0) {
      localStorage.removeItem(STORAGE_KEYS.recentlyViewed);
    } else {
      localStorage.setItem(STORAGE_KEYS.recentlyViewed, JSON.stringify(ids));
    }
  } catch (err) {
    log.warn("recently-viewed write failed", { area: "recently-viewed" }, err);
  }
}

export interface UseRecentlyViewedResult {
  /** Case ids in most-recent-first order, length ≤ MAX_RECENTLY_VIEWED. */
  ids: string[];
  /** Resolved cases (most-recent first), excluding the current `currentId`
   *  if provided. Ids that no longer map to a live case (purged) are
   *  silently dropped so the rail stays clean. */
  cases: CaseRecord[];
  /** Append the id to the trail. Dedupes — if the id is already in
   *  the list, it gets bumped to the front. Caps at MAX. */
  add: (id: string) => void;
  /** Drop the entire trail (used by the Backup "Clear personal data"
   *  flow). */
  clear: () => void;
}

/**
 * Hook over the recently-viewed trail.
 *
 * @param allCases - Full catalog (e.g. from `useMergedCatalog`).
 *                   Used to resolve stored ids to live `CaseRecord`
 *                   objects for the rail to render.
 * @param currentId - Optional. The case currently open in the modal,
 *                    excluded from `cases` so the rail doesn't show
 *                    "you're already looking at this."
 */
export function useRecentlyViewed(
  allCases: CaseRecord[],
  currentId: string | null = null,
): UseRecentlyViewedResult {
  // SSR-safe initial state — empty array on the server, hydrated from
  // localStorage on the first client render via a lazy initializer.
  // This mirrors the `useFavs` pattern.
  const [ids, setIds] = useState<string[]>(() => readStored());

  // Cross-tab sync. If the user opens a case in another tab, the
  // storage event fires on this tab's window. Refresh the list so
  // both tabs converge to the same trail.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.recentlyViewed) return;
      setIds(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((id: string) => {
    if (!id) return;
    setIds((prev) => {
      const without = prev.filter((existing) => existing !== id);
      const next = [id, ...without].slice(0, MAX_RECENTLY_VIEWED);
      writeStored(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setIds([]);
    writeStored([]);
  }, []);

  // Resolve ids → live CaseRecord, dropping any that no longer exist
  // and the current open case. Index map keeps the lookup O(1) per
  // id; the trail is small but the catalog can have hundreds of
  // cases and we don't want a linear scan per row.
  const cases = useMemo(() => {
    const byId = new Map<string, CaseRecord>();
    for (const c of allCases) byId.set(c.id, c);
    const out: CaseRecord[] = [];
    for (const id of ids) {
      if (id === currentId) continue;
      const found = byId.get(id);
      if (found) out.push(found);
    }
    return out;
  }, [ids, allCases, currentId]);

  return { ids, cases, add, clear };
}
