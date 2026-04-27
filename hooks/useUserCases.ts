"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { repo } from "@/lib/repo";
import type { CaseRecord, User } from "@/lib/types";

interface Options {
  /** User-facing message channel for save / delete / restore failures. */
  notify?: (message: string) => void;
}

/**
 * Owns admin-authored cases: the raw list plus derived "live" and
 * "trashed" projections, plus the four CRUD operations.
 *
 * The `_raw_` list (including soft-deleted) is the source of truth.
 * The dispatcher in `lib/repo.ts` decides whether reads/writes go to
 * localStorage or Firestore; this hook only knows the contract.
 *
 * Returns a stable shape so consumers can wire the methods straight
 * into UI handlers without re-creating closures.
 */
export function useUserCases(user: User | null, hydrated: boolean, { notify }: Options = {}) {
  const [raw, setRaw] = useState<CaseRecord[]>([]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void (async () => {
      const list = await repo.cases.listUserRaw();
      if (!cancelled) setRaw(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  const live = useMemo(() => raw.filter((c) => !c.deletedAt), [raw]);
  const trashed = useMemo(() => raw.filter((c) => c.deletedAt), [raw]);

  const refresh = useCallback(async () => {
    setRaw(await repo.cases.listUserRaw());
  }, []);

  const save = useCallback(
    async (c: CaseRecord, opts: { isUpdate: boolean }) => {
      const result = await repo.cases.save(c, raw);
      if (!result.ok) {
        notify?.(
          result.reason === "quota"
            ? "Sin espacio. Borra casos antiguos o sube archivos más livianos."
            : "No se pudo guardar el caso.",
        );
        return false;
      }
      await refresh();
      notify?.(opts.isUpdate ? "Caso actualizado" : "Caso publicado");
      return true;
    },
    [raw, notify, refresh],
  );

  const remove = useCallback(
    async (c: CaseRecord) => {
      const result = await repo.cases.remove(c.id, raw, user?.email);
      if (!result.ok) {
        notify?.("No se pudo eliminar el caso.");
        return false;
      }
      await refresh();
      notify?.("Caso eliminado · puedes restaurarlo desde Papelera");
      return true;
    },
    [raw, user, notify, refresh],
  );

  const restore = useCallback(
    async (c: CaseRecord) => {
      const result = await repo.cases.restore(c.id, raw);
      if (!result.ok) {
        notify?.("No se pudo restaurar el caso.");
        return false;
      }
      await refresh();
      notify?.("Caso restaurado");
      return true;
    },
    [raw, notify, refresh],
  );

  const purge = useCallback(
    async (c: CaseRecord) => {
      const result = await repo.cases.purge(c.id, raw);
      if (!result.ok) {
        notify?.("No se pudo eliminar definitivamente.");
        return false;
      }
      await refresh();
      notify?.("Caso eliminado permanentemente");
      return true;
    },
    [raw, notify, refresh],
  );

  return { raw, live, trashed, save, remove, restore, purge };
}
