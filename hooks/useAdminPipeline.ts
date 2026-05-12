"use client";

import { useState } from "react";
import { repo } from "@/lib/repo";
import { mediaKeyFromSrc } from "@/lib/media-url";
import { useLanguage } from "./useLanguage";
import { getCaseTitle } from "@/lib/case-localized";
import type { ShowToast } from "./useToast";
import type { CaseRecord, User } from "@/lib/types";

interface UserCasesShape {
  live: CaseRecord[];
  remove: (c: CaseRecord) => Promise<boolean>;
  /** Inverse of `remove`. Used by the undo path on a soft-delete
   *  toast — calling it within the toast window restores the case
   *  with `deletedAt` cleared. */
  restore: (c: CaseRecord) => Promise<boolean>;
}

interface Args {
  user: User | null;
  userCases: UserCasesShape;
  setOverride: (id: string, patch: Partial<CaseRecord>) => Promise<boolean>;
  /** Toast channel. Accepts the full `ShowToast` shape (with
   *  optional undo) so the destructive flows can offer "Deshacer"
   *  on every soft action. */
  showToast: ShowToast;
  /** True when the case modal is open and shows the case being purged
   *  — the pipeline closes the modal first so the toast is visible. */
  openCaseId: string | null;
  /** URL patcher used to close the case modal mid-purge. */
  closeOpenCase: () => void;
}

interface Pipeline {
  /** Start the soft-delete flow (parent renders ConfirmDialog
   *  bound to `pendingDelete` and calls `confirmDelete`). */
  pendingDelete: CaseRecord | null;
  requestDelete: (c: CaseRecord) => void;
  confirmDelete: () => Promise<void>;
  cancelDelete: () => void;

  /** Start the permanent-delete flow. Same shape as the soft-delete
   *  pair but routes through `repo.cases.purgeImported` (writes a
   *  `{ purged: true }` tombstone + best-effort blob delete). */
  pendingPurge: CaseRecord | null;
  requestPurge: (c: CaseRecord) => void;
  confirmPurge: () => Promise<void>;
  cancelPurge: () => void;

  /** Reverses a soft-delete on a seed/imported case by clearing the
   *  `deletedAt` / `deletedBy` override fields. Other override
   *  fields (category, title, …) survive. */
  restoreImport: (c: CaseRecord) => Promise<void>;
}

/**
 * Owns the destructive flows the admin can trigger from the modal,
 * the classifier, the AdminThumbMenu, and the trash table — all
 * funneled through one place so the confirm dialog copy and the
 * side-effect ordering live in one file.
 *
 * The hook deliberately does NOT render UI (the parent owns the
 * `<ConfirmDialog>` bindings). It only owns the state machine and
 * the actual mutation calls.
 *
 * Two delete paths share the same `pendingDelete` / `confirmDelete`
 * pair:
 *   1. Admin-uploaded cases → `userCases.remove` (repo CRUD).
 *   2. Seed / imported cases → `setOverride` writes a `deletedAt`
 *      tombstone the catalog merge filters out.
 *
 * Purge is a separate flow because it's irreversible and writes a
 * different tombstone (`purged: true`) + deletes the blob.
 */
export function useAdminPipeline({
  user,
  userCases,
  setOverride,
  showToast,
  openCaseId,
  closeOpenCase,
}: Args): Pipeline {
  const { lang, t } = useLanguage();
  const [pendingDelete, setPendingDelete] = useState<CaseRecord | null>(null);
  const [pendingPurge, setPendingPurge] = useState<CaseRecord | null>(null);

  // ─── soft-delete ────────────────────────────────────────────────
  const requestDelete = (c: CaseRecord) => setPendingDelete(c);
  const cancelDelete = () => setPendingDelete(null);
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    // Resolve once, in the active language, so a seed case with no
    // EN slot falls back to the ES baseline (LocalizedRead.fallback)
    // and an EN-mode admin gets the EN title when it exists.
    const titleText = getCaseTitle(target, lang).value;
    const isUserOwned = userCases.live.some((c) => c.id === target.id);
    if (isUserOwned) {
      const ok = await userCases.remove(target);
      if (ok) {
        showToast(t("toast.case.deletedTitled", { title: titleText }), {
          undo: () => userCases.restore(target),
        });
      }
    } else {
      const ok = await setOverride(target.id, {
        deletedAt: new Date().toISOString(),
        deletedBy: user?.email,
      });
      if (ok) {
        // Undo for a seed case: clear the deletedAt/deletedBy
        // override fields. Other override fields (category, focus,
        // reviewed) survive — the undo only reverses what this call
        // set.
        showToast(t("toast.case.deletedTitled", { title: titleText }), {
          undo: () =>
            setOverride(target.id, {
              deletedAt: undefined,
              deletedBy: undefined,
            }),
        });
      }
    }
    setPendingDelete(null);
  };

  // ─── permanent delete ──────────────────────────────────────────
  const requestPurge = (c: CaseRecord) => setPendingPurge(c);
  const cancelPurge = () => setPendingPurge(null);
  const confirmPurge = async () => {
    if (!pendingPurge) return;
    const c = pendingPurge;
    setPendingPurge(null);
    // Close the case modal if it's the one being purged so the toast
    // is visible above the layout instead of stuck behind the dialog.
    if (openCaseId === c.id) closeOpenCase();
    const titleText = getCaseTitle(c, lang).value;
    const mediaKey = mediaKeyFromSrc(c.media?.src);
    const ok = await repo.cases.purgeImported(c.id, mediaKey);
    if (ok.ok) {
      showToast(t("toast.case.purgedTitled", { title: titleText }));
    } else {
      showToast(t("toast.case.purgeFailed"));
    }
  };

  // ─── restore from trash ────────────────────────────────────────
  const restoreImport = async (c: CaseRecord) => {
    const ok = await setOverride(c.id, {
      deletedAt: undefined,
      deletedBy: undefined,
    });
    if (ok) showToast(t("toast.case.restored"));
  };

  return {
    pendingDelete,
    requestDelete,
    confirmDelete,
    cancelDelete,
    pendingPurge,
    requestPurge,
    confirmPurge,
    cancelPurge,
    restoreImport,
  };
}
