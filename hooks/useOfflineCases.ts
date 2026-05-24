"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listOfflineUrls,
  readSavedCaseIds,
  removeCaseOffline,
  saveCaseOffline,
  writeSavedCaseIds,
} from "@/lib/offline-cases";
import type { CaseRecord } from "@/lib/types";

interface UseOfflineCasesArgs {
  /** The currently-loaded case corpus. Lets us reverse-lookup
   *  caseId → media URL (and the inverse) without each call-site
   *  passing the URL explicitly. */
  cases: CaseRecord[];
  /** Toast hook from `useToast` — the hook surfaces LRU evictions
   *  and quota errors as toasts so the user knows what happened.
   *  Optional; calls are no-ops when omitted (e.g. in unit tests). */
  notify?: (message: string) => void;
}

interface UseOfflineCasesReturn {
  /** Set of case IDs currently marked for offline use. */
  savedIds: Set<string>;
  /** True while a save / remove / reconcile is in-flight. Drives
   *  the modal toggle's "saving…" spinner state. */
  pending: boolean;
  /** Save a case's media for offline. Returns true on success. */
  save: (caseId: string) => Promise<boolean>;
  /** Remove a case's media from offline cache. */
  remove: (caseId: string) => Promise<boolean>;
  /** Convenience helper: flips current state. */
  toggle: (caseId: string) => Promise<boolean>;
  /** True iff the given case is saved (sync lookup). */
  isSaved: (caseId: string) => boolean;
}

/**
 * React hook for the "save case offline" feature. Three responsibilities:
 *
 *   1. Maintain the local Set of saved case IDs (mirrored in
 *      `localStorage` for fast first-paint reads).
 *   2. Talk to the service worker over its message protocol to
 *      add/remove URLs from `pocus-offline-media` (see `app/sw.ts`).
 *   3. Reconcile at boot: ask the SW for the actual cached URL
 *      list and drop any local IDs whose URL isn't there. This
 *      handles "Settings → Clear site data", LRU eviction during
 *      a closed-tab session, and a stale cache after the user
 *      uninstalls + reinstalls the PWA.
 *
 * Reverse lookup `caseId → mediaUrl` happens against the passed
 * `cases` array. If a saved id maps to a case that's gone from
 * the corpus (admin deleted it), that id stays in the local set
 * until the user explicitly purges; the SW will report it as
 * missing on next reconcile and we'll drop it then.
 */
export function useOfflineCases({ cases, notify }: UseOfflineCasesArgs): UseOfflineCasesReturn {
  const [savedIds, setSavedIds] = useState<Set<string>>(() => readSavedCaseIds());
  const [pending, setPending] = useState(false);

  // URL ↔ id table. Recomputed when the corpus changes. Memoized
  // because `cases` is a stable ref between most renders (parent
  // already memoizes it).
  const urlToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cases) {
      if (c.media?.src) map.set(c.media.src, c.id);
    }
    return map;
  }, [cases]);

  const idToUrl = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cases) {
      if (c.media?.src) map.set(c.id, c.media.src);
    }
    return map;
  }, [cases]);

  // Boot reconcile: ask the SW for its cache snapshot, drop any
  // local IDs that aren't actually cached. Done once per mount; if
  // the user closes the tab + the SW evicts in the background +
  // the user comes back, the next mount catches up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const urls = await listOfflineUrls();
      if (cancelled || urls === null) return;
      const cachedIds = new Set<string>();
      for (const url of urls) {
        const id = urlToId.get(url);
        if (id) cachedIds.add(id);
      }
      // Drop any local IDs whose URL is NOT in the cache. Keep
      // IDs that exist locally + are cached. The intersection is
      // the truth.
      setSavedIds((prev) => {
        let changed = prev.size !== cachedIds.size;
        if (!changed) {
          for (const id of prev)
            if (!cachedIds.has(id)) {
              changed = true;
              break;
            }
        }
        if (!changed) return prev;
        writeSavedCaseIds(cachedIds);
        return cachedIds;
      });
    })();
    return () => {
      cancelled = true;
    };
    // urlToId is the only meaningful trigger — we want this to
    // re-run when the corpus changes (admin edited a case, etc).
  }, [urlToId]);

  const save = useCallback(
    async (caseId: string): Promise<boolean> => {
      const url = idToUrl.get(caseId);
      if (!url) return false;
      setPending(true);
      try {
        const result = await saveCaseOffline(caseId, url);
        if (!result.ok) {
          if (notify) {
            // Surface quota / fetch errors so the user understands
            // why nothing changed. The error string from the SW is
            // technical; the toast wraps it in language the user
            // can act on. (Future: i18n the wrapper text.)
            notify(
              result.error === "no-controller"
                ? "El service worker aún no está activo. Recargá e intentá de nuevo."
                : "No se pudo guardar el caso para offline.",
            );
          }
          return false;
        }
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.add(caseId);
          return next;
        });
        if (result.evictedCount > 0 && notify) {
          // LRU eviction: tell the user we made room. Specific
          // count helps the user reason about their storage.
          notify(
            result.evictedCount === 1
              ? "Liberamos un caso para hacer espacio"
              : `Liberamos ${result.evictedCount} casos para hacer espacio`,
          );
        }
        return true;
      } finally {
        setPending(false);
      }
    },
    [idToUrl, notify],
  );

  const remove = useCallback(
    async (caseId: string): Promise<boolean> => {
      const url = idToUrl.get(caseId);
      if (!url) return false;
      setPending(true);
      try {
        const result = await removeCaseOffline(caseId, url);
        if (!result.ok) {
          if (notify) notify("No se pudo eliminar el caso del cache offline.");
          return false;
        }
        setSavedIds((prev) => {
          if (!prev.has(caseId)) return prev;
          const next = new Set(prev);
          next.delete(caseId);
          return next;
        });
        return true;
      } finally {
        setPending(false);
      }
    },
    [idToUrl, notify],
  );

  const toggle = useCallback(
    (caseId: string) => (savedIds.has(caseId) ? remove(caseId) : save(caseId)),
    [savedIds, save, remove],
  );

  const isSaved = useCallback((caseId: string) => savedIds.has(caseId), [savedIds]);

  return { savedIds, pending, save, remove, toggle, isSaved };
}

/**
 * Module-level imperative API for non-React surfaces. The modal
 * uses the React hook; the future settings panel may want to call
 * "purge all" or "list" from outside React tree. Re-exports the
 * lib functions with the same names so consumers have a single
 * import for the feature.
 */
export {
  listOfflineUrls,
  postToSW,
  purgeAllOffline,
  readStorageEstimate,
} from "@/lib/offline-cases";
