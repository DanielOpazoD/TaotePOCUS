// localStorage-backed implementation of the favorites repo. Tiny
// surface (list / toggle) but extracted alongside `local-cases` so
// the dispatch layer in `lib/repo.ts` doesn't host any backend code,
// only the runtime selection.

import { Store, type WriteResult } from "../store";

export const localFavs = {
  async list(email?: string | null): Promise<string[]> {
    return Store.getFavs(email);
  },
  async toggle(
    email: string | null | undefined,
    id: string,
    current: string[],
  ): Promise<{ result: WriteResult; next: string[] }> {
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    const result = Store.setFavs(email, next);
    return { result, next };
  },
};

export type FavsRepo = typeof localFavs;
