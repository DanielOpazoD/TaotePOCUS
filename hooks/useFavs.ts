"use client";

import { useCallback, useEffect, useState } from "react";
import { repo } from "@/lib/repo";
import type { User } from "@/lib/types";

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

  const toggle = useCallback(
    async (id: string) => {
      if (!user) {
        onAnonymous();
        return;
      }
      const { result, next } = await repo.favs.toggle(user.email, id, favs);
      if (!result.ok) {
        notify?.("No se pudo guardar el favorito.");
        return;
      }
      setFavs(next);
    },
    [user, favs, onAnonymous, notify],
  );

  return { favs, toggle };
}
