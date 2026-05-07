"use client";

import { useCallback } from "react";
import type { CaseRecord, User } from "@/lib/types";

/**
 * Admin-action factory. Encapsulates the three closures that used to
 * live inline in `App.tsx > AppInner`:
 *
 *   - `onPatch(id, patch)`            — single-case override + undo toast
 *   - `onBulkPatch(ids, patch)`       — many-case override + grouped undo toast
 *   - `onBulkSoftDelete(ids)`         — many-case soft-delete (split by ownership) + undo toast
 *
 * The previous inline shape made `App.tsx` ~720 LOC and hid the
 * admin-action contract behind 200+ lines of prop wiring inside JSX.
 * Lifting the closures here makes the surface unit-testable, drops
 * App.tsx by ~140 lines, and gives a single named import for
 * `MainGrid` / `BulkEditTable` to depend on.
 *
 * Behaviour preserved verbatim:
 *
 *   - Each mutation captures the case's pre-state for the keys the
 *     patch touches, so the undo toast can restore exact values.
 *   - Cases not in the merged catalog (deep-linked soft-deleted
 *     entries) skip the undo affordance rather than offer an
 *     inverse we can't compute.
 *   - Bulk soft-delete routes each id by ownership: user-uploaded
 *     cases go through the user_cases CRUD path so the trash table
 *     picks them up; seed cases get an override-based `deletedAt`
 *     tombstone. The undo loops the inverse for each.
 *
 * The hook does NOT gate on admin role — callers pass `isAdmin` and
 * decide whether to wire the returned callbacks to UI. This mirrors
 * the original pattern (each callback was conditionally `undefined`
 * at the JSX site).
 */

export interface UseAdminActionsDeps {
  /** Merged catalog (seed + overrides + user_cases). Read-only here. */
  allCases: CaseRecord[];
  /** Live + trashed user-uploaded cases plus the CRUD ops the bulk
   *  delete needs to route owned cases through. */
  userCases: {
    live: CaseRecord[];
    trashed: CaseRecord[];
    remove: (c: CaseRecord) => Promise<boolean>;
    restore: (c: CaseRecord) => Promise<boolean>;
  };
  /** Apply a partial override (or restore one). Returns true on
   *  success; the closures use the result to drop the toast on
   *  total failure. */
  setOverride: (id: string, patch: Partial<CaseRecord>) => Promise<boolean>;
  /** Toast surface — receives a message + an optional undo handle. */
  showToast: (message: string, options?: { undo?: () => Promise<unknown> | unknown }) => void;
  /** Currently logged-in user (for `deletedBy` audit trail on
   *  soft-deleted seed cases). */
  user: User | null;
}

export interface UseAdminActionsResult {
  onPatch: (id: string, patch: Partial<CaseRecord>) => Promise<void>;
  onBulkPatch: (ids: string[], patch: Partial<CaseRecord>) => Promise<void>;
  onBulkSoftDelete: (ids: string[]) => Promise<void>;
}

export function useAdminActions(deps: UseAdminActionsDeps): UseAdminActionsResult {
  const { allCases, userCases, setOverride, showToast, user } = deps;

  const onPatch = useCallback(
    async (id: string, patch: Partial<CaseRecord>) => {
      // Capture the case's current value for every key the patch
      // is touching BEFORE applying. The undo toast restores those
      // values via a new patch; if the case isn't in the merged
      // catalog (rare — deep link to a soft-deleted case) we skip
      // the undo affordance rather than offer an inverse we can't
      // compute.
      const before = allCases.find((c) => c.id === id);
      const inverse: Partial<CaseRecord> | null = before
        ? Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof CaseRecord]]))
        : null;
      const ok = await setOverride(id, patch);
      if (!ok) return;
      // Pick the most specific message — the order matches what an
      // admin clicked. `focus` and `reviewed` get their own copy so
      // the undo affordance lands next to a clear nominal cue.
      let message: string;
      if (patch.section) message = "Sección actualizada";
      else if (patch.category) message = "Categoría actualizada";
      else if ("reviewed" in patch)
        message = patch.reviewed ? "Marcado revisado" : "Sin marca de revisado";
      else if ("focus" in patch) message = "Encuadre actualizado";
      else message = "Caso actualizado";
      showToast(message, inverse ? { undo: () => setOverride(id, inverse) } : undefined);
    },
    [allCases, setOverride, showToast],
  );

  const onBulkPatch = useCallback(
    async (ids: string[], patch: Partial<CaseRecord>) => {
      // Capture the previous values per id BEFORE applying so the
      // unified undo can restore each card's pre-bulk state. Cards
      // not in the merged catalog (deep-linked soft-deleted) are
      // skipped from the inverse map; their forward patch still
      // lands.
      const inverses: Array<{ id: string; patch: Partial<CaseRecord> }> = [];
      for (const id of ids) {
        const before = allCases.find((c) => c.id === id);
        if (!before) continue;
        inverses.push({
          id,
          patch: Object.fromEntries(
            Object.keys(patch).map((k) => [k, before[k as keyof CaseRecord]]),
          ),
        });
      }
      // Fire the forward patches in parallel — they all hit local
      // state + the same DB row family and the dual-write mirror
      // tolerates the out-of-order arrivals at scale.
      const results = await Promise.all(ids.map((id) => setOverride(id, patch)));
      const okCount = results.filter(Boolean).length;
      if (okCount === 0) {
        showToast("No se pudo aplicar el cambio");
        return;
      }
      let label: string;
      if (patch.section) label = "Sección";
      else if (patch.category) label = "Categoría";
      else if ("reviewed" in patch) label = patch.reviewed ? "Revisado" : "Sin revisar";
      else label = "Cambio";
      showToast(
        `${label}: ${okCount} caso${okCount === 1 ? "" : "s"} actualizado${okCount === 1 ? "" : "s"}`,
        inverses.length > 0
          ? {
              undo: () => Promise.all(inverses.map(({ id, patch: inv }) => setOverride(id, inv))),
            }
          : undefined,
      );
    },
    [allCases, setOverride, showToast],
  );

  const onBulkSoftDelete = useCallback(
    async (ids: string[]) => {
      // Bulk soft-delete: route each id by ownership. User-owned
      // cases go through `userCases.remove` (real CRUD) so the
      // trash view picks them up; seed cases get an override-based
      // deletedAt tombstone. The undo loops the inverse for each.
      const userOwned = new Set(userCases.live.map((c) => c.id));
      const stamp = new Date().toISOString();
      const targets: Array<{ id: string; kind: "owned" | "seed" }> = ids.map((id) => ({
        id,
        kind: userOwned.has(id) ? "owned" : "seed",
      }));
      const results = await Promise.all(
        targets.map(async (t) => {
          if (t.kind === "owned") {
            const c = userCases.live.find((x) => x.id === t.id);
            if (!c) return false;
            return userCases.remove(c);
          }
          return setOverride(t.id, {
            deletedAt: stamp,
            deletedBy: user?.email,
          });
        }),
      );
      const okCount = results.filter(Boolean).length;
      if (okCount === 0) {
        showToast("No se pudo mover a papelera");
        return;
      }
      showToast(
        `${okCount} caso${okCount === 1 ? "" : "s"} movido${okCount === 1 ? "" : "s"} a papelera`,
        {
          undo: () =>
            Promise.all(
              targets.map((t) => {
                if (t.kind === "owned") {
                  const c = userCases.trashed.find((x) => x.id === t.id);
                  if (!c) return Promise.resolve(false);
                  return userCases.restore(c);
                }
                return setOverride(t.id, {
                  deletedAt: undefined,
                  deletedBy: undefined,
                });
              }),
            ),
        },
      );
    },
    [userCases, setOverride, showToast, user],
  );

  return { onPatch, onBulkPatch, onBulkSoftDelete };
}
