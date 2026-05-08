"use client";

// `onSaveCase` for the admin form: branches between user-uploaded
// cases (write through `userCases.save` → repo CRUD) and seed /
// imported cases (write through the override map). Pulled out of
// `App.tsx` so the orchestrator forwards a single stable callback
// instead of hosting the branching logic inline.

import { useCallback } from "react";
import type { CaseRecord } from "@/lib/types";

interface UserCasesShape {
  live: CaseRecord[];
  save: (c: CaseRecord, opts: { isUpdate: boolean }) => Promise<boolean>;
}

interface Args {
  /** From `useUserCases` — the live admin-uploaded list + save fn. */
  userCases: UserCasesShape;
  /** From `useCaseOverrides` — used for seed/imported case edits. */
  setOverride: (id: string, patch: Partial<CaseRecord>) => Promise<boolean>;
  /** Toast surface — surfaces a one-liner when an override write
   *  lands so the admin sees confirmation. */
  showToast: (msg: string) => void;
  /** When the admin opened the form to edit an existing case
   *  (rather than create a new one), the orchestrator stashes the
   *  original here so the saver can decide which save path to
   *  take. `null` for a fresh "Nuevo caso" flow. */
  editingCase: CaseRecord | null;
  /** Cleanup callbacks the orchestrator wants run after a
   *  successful save (close the modal, clear the editing slot). */
  onAfterSave: () => void;
}

/**
 * Returns a stable `onSaveCase(data)` callback. The two save paths:
 *
 *   1. Admin-uploaded cases (live in `userCases`) — go through
 *      `repo.cases` CRUD via `userCases.save`. The save indicator
 *      already toasts its own success/failure (see `useUserCases`),
 *      so this layer doesn't add a second toast.
 *   2. Seed / imported cases the admin reclassified — go through
 *      `setOverride`. Override writes don't already toast, so this
 *      layer surfaces "Caso editado" on success.
 */
export function useCaseSaver({
  userCases,
  setOverride,
  showToast,
  editingCase,
  onAfterSave,
}: Args) {
  return useCallback(
    async (data: CaseRecord) => {
      const isUserOwned = userCases.live.some((c) => c.id === data.id);
      let ok: boolean;
      if (isUserOwned || !editingCase) {
        // New case (no editingCase → fresh upload) or editing an
        // existing admin-owned case both go through the repo CRUD.
        ok = await userCases.save(data, { isUpdate: !!editingCase?.id });
      } else {
        // Editing a seed/imported case → save as override.
        ok = await setOverride(data.id, data);
        if (ok) showToast("Caso editado · puedes descartar desde el modal");
      }
      if (!ok) return;
      onAfterSave();
    },
    [userCases, setOverride, showToast, editingCase, onAfterSave],
  );
}
