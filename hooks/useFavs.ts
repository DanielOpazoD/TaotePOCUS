"use client";

import { useCallback, useEffect, useState } from "react";
import { repo } from "@/lib/repo";
import { log } from "@/lib/log";
import type { User } from "@/lib/types";
import { useCrossTabSync } from "./useCrossTabSync";

interface Options {
  /** Triggers the auth modal when an anonymous user tries to favorite. */
  onAnonymous: () => void;
  /** User-facing message channel for storage failures. */
  notify?: (message: string) => void;
}

/**
 * Owns the favorites list scoped to the current user. Re-loads when
 * the user identity changes (login / logout / focus revalidation).
 *
 * `toggle(id)` is optimistic-friendly: writes to the repo and only
 * commits to local state if the persistence layer accepts. On failure
 * the toast surfaces the reason and state stays unchanged.
 */
export function useFavs(user: User | null, hydrated: boolean, options: Options) {
  const { onAnonymous, notify } = options;
  const [favs, setFavs] = useState<string[]>([]);

  // Re-fetch favs whenever the active user changes (or after first hydration).
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void (async () => {
      const list = await repo.favs.list(user?.email);
      if (!cancelled) setFavs(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, hydrated]);

  // Cross-tab sync. When another tab toggles a favorite, the
  // localStorage write fires; this tab's BroadcastChannel listener
  // re-reads and re-renders. Without this, the second tab kept
  // showing the stale list until F5.
  const publishFavsChange = useCrossTabSync("favs", () => {
    if (!hydrated) return;
    void repo.favs.list(user?.email).then(setFavs);
  });

  const toggle = useCallback(
    async (id: string) => {
      if (!user) {
        onAnonymous();
        return;
      }
      const { result, next } = await repo.favs.toggle(user.email, id, favs);
      if (!result.ok) {
        log.warn("favorite toggle failed", {
          area: "favs",
          reason: result.reason,
          caseId: id,
          email: user.email,
        });
        notify?.(
          result.reason === "quota"
            ? "Sin espacio para más favoritos. Quita algunos para añadir nuevos."
            : "No se pudo guardar el favorito.",
        );
        return;
      }
      setFavs(next);
      // Notify other tabs so their UI reflects the new fav state.
      publishFavsChange();
    },
    [user, favs, onAnonymous, notify, publishFavsChange],
  );

  return { favs, toggle };
}
