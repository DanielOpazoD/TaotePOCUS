"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { repo } from "@/lib/repo";
import { log } from "@/lib/log";
import type { CaseRecord, User } from "@/lib/types";
import { useCrossTabSync } from "./useCrossTabSync";

interface Options {
  /** User-facing message channel for save / delete / restore failures. */
  notify?: (message: string) => void;
}

/** Map a storage failure reason to a user-facing Spanish message.
 *  Branches on the widened `WriteResult.reason` union (ADR-0011): the
 *  `auth_required` / `forbidden` cases come from the server-side
 *  authorization layer when the dual-write path awaits the DB
 *  result; the others come from localStorage limits. */
function describeFailure(
  op: string,
  reason: "quota" | "unavailable" | "unknown" | "auth_required" | "forbidden",
): string {
  if (reason === "quota") {
    return "Sin espacio. Borra casos antiguos o sube archivos más livianos.";
  }
  if (reason === "unavailable") {
    return "Almacenamiento no disponible. Comprueba modo privado / cuotas.";
  }
  if (reason === "auth_required") {
    return "Sesión expirada. Vuelve a iniciar sesión para guardar.";
  }
  if (reason === "forbidden") {
    return "No tienes permiso para esta acción.";
  }
  // "unknown" — keep the message specific to the operation so the toast
  // is informative without leaking internals.
  switch (op) {
    case "save":
      return "No se pudo guardar el caso.";
    case "remove":
      return "No se pudo eliminar el caso.";
    case "restore":
      return "No se pudo restaurar el caso.";
    case "purge":
      return "No se pudo eliminar definitivamente.";
    default:
      return "Operación fallida.";
  }
}

/**
 * Owns admin-authored cases: the raw list plus derived "live" and
 * "trashed" projections, plus the four CRUD operations.
 *
 * The `_raw_` list (including soft-deleted) is the source of truth.
 * The dispatcher in `lib/repo.ts` decides whether reads/writes go to
 * localStorage or Firestore; this hook only knows the contract.
 *
 * Each CRUD op logs failures via `lib/log` (so Sentry sees them once
 * wired) and surfaces a reason-aware Spanish message via `notify`.
 *
 * @param user - The current authenticated user, or null if anonymous.
 *   Used as the audit trail for soft-deletes (`deletedBy`).
 * @param hydrated - From `useSession`. When false, the hook holds off
 *   on the initial fetch — avoids flashing an empty admin panel
 *   before the session resolves.
 * @param options.notify - Toast channel for save/delete/restore status.
 * @returns
 *   - `raw`: the full list including soft-deleted entries (admin only).
 *   - `live`: filtered to non-deleted (the public view).
 *   - `trashed`: filtered to soft-deleted (admin papelera).
 *   - `save / remove / restore / purge`: async ops returning a boolean
 *     (true on success). Failures already toast + log internally.
 *
 * @example
 *   const userCases = useUserCases(user, hydrated, { notify });
 *   await userCases.save(case, { isUpdate: false });
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

  // Cross-tab sync: another tab saving / soft-deleting / restoring
  // / purging a user case fires this listener; we re-read from the
  // repo (which already does dedup-by-id). Without this, two open
  // admin tabs see divergent lists until F5.
  const publishUserCasesChange = useCrossTabSync("user-cases", () => {
    if (!hydrated) return;
    void repo.cases.listUserRaw().then(setRaw);
  });

  const save = useCallback(
    async (c: CaseRecord, opts: { isUpdate: boolean }) => {
      const result = await repo.cases.save(c, raw);
      if (!result.ok) {
        log.warn("save case failed", {
          area: "userCases",
          op: "save",
          reason: result.reason,
          caseId: c.id,
        });
        notify?.(describeFailure("save", result.reason));
        return false;
      }
      await refresh();
      publishUserCasesChange();
      notify?.(opts.isUpdate ? "Caso actualizado" : "Caso publicado");
      return true;
    },
    [raw, notify, refresh, publishUserCasesChange],
  );

  const remove = useCallback(
    async (c: CaseRecord) => {
      const result = await repo.cases.remove(c.id, raw, user?.email);
      if (!result.ok) {
        log.warn("remove case failed", {
          area: "userCases",
          op: "remove",
          reason: result.reason,
          caseId: c.id,
        });
        notify?.(describeFailure("remove", result.reason));
        return false;
      }
      await refresh();
      publishUserCasesChange();
      notify?.("Caso eliminado · puedes restaurarlo desde Papelera");
      return true;
    },
    [raw, user, notify, refresh, publishUserCasesChange],
  );

  const restore = useCallback(
    async (c: CaseRecord) => {
      const result = await repo.cases.restore(c.id, raw);
      if (!result.ok) {
        log.warn("restore case failed", {
          area: "userCases",
          op: "restore",
          reason: result.reason,
          caseId: c.id,
        });
        // Restore can hit quota too — it removes the deletedAt marker
        // but the entry may have grown via media uploads in between.
        notify?.(describeFailure("restore", result.reason));
        return false;
      }
      await refresh();
      publishUserCasesChange();
      notify?.("Caso restaurado");
      return true;
    },
    [raw, notify, refresh, publishUserCasesChange],
  );

  const purge = useCallback(
    async (c: CaseRecord) => {
      const result = await repo.cases.purge(c.id, raw);
      if (!result.ok) {
        log.warn("purge case failed", {
          area: "userCases",
          op: "purge",
          reason: result.reason,
          caseId: c.id,
        });
        notify?.(describeFailure("purge", result.reason));
        return false;
      }
      await refresh();
      publishUserCasesChange();
      notify?.("Caso eliminado permanentemente");
      return true;
    },
    [raw, notify, refresh, publishUserCasesChange],
  );

  return { raw, live, trashed, save, remove, restore, purge };
}
