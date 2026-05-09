"use client";

// Admin-managed catalog configuration: custom categories, hidden
// sections, and section label overrides. Bundles the three
// underlying hooks (`useCustomCategories`, `useHiddenSections`,
// `useSectionLabels`) plus the toast-wrapped category mutations so
// the orchestrator (`App.tsx`) only sees one composable surface
// instead of three distinct concerns.
//
// Pulled out of `App.tsx` in May-2026 — those three hooks plus the
// toast wrappers were ~75 LOC of side-by-side declarations in the
// orchestrator and made the data-flow story noisy. Now App.tsx
// destructures one return object and forwards it to MainGrid /
// Header / MobileDrawer.
//
// Phase-3 i18n (Nov-2026) widened category labels and section label
// overrides to `LocalizedString`. The hook accepts a `lang` arg so
// `visibleSectionsWithLabels` resolves to the right slot for the
// active UI language; the bilingual mutation API accepts both
// plain strings (back-compat) and `LocalizedString` objects.

import { useMemo } from "react";
import { useCustomCategories } from "./useCustomCategories";
import { useHiddenSections } from "./useHiddenSections";
import { useSectionLabels, type SectionLabelOverrides } from "./useSectionLabels";
import { categoryLabel } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import type { Category, LocalizedString, Section, SectionId } from "@/lib/types";

interface Args {
  /** Toast surface — used to surface "Categoría renombrada" /
   *  "Categoría eliminada" undo affordances. */
  showToast: (msg: string, opts?: { undo?: () => void; undoLabel?: string }) => void;
  /** Active UI language. Threaded into `visibleSectionsWithLabels`
   *  so the public nav picks the right slot from the override; the
   *  toast strings still surface the ES baseline for editorial
   *  consistency in the admin layer. Defaults to "es" so older
   *  callers (focused tests) keep working unchanged. */
  lang?: Lang;
}

export interface CatalogConfig {
  // Categories ------------------------------------------------------
  /** Full categories list (built-in + custom, including hidden).
   *  Pass to AdminPanel's CategoriesEditor. */
  categories: Category[];
  /** Predicate — is this id a runtime-defined custom category? */
  isCustomCategory: (id: string) => boolean;
  /** Predicate — is this category hidden from the public sidebar? */
  isCategoryHidden: (id: string) => boolean;
  /** Setter — show / hide a category in the public sidebar. */
  setCategoryHidden: (id: string, hidden: boolean) => void;
  /**
   * Add a category. Accepts a plain string (legacy callers) or a
   * `LocalizedString` (Phase-3 dual-language editor). Surfaces a
   * "Categoría agregada" toast on success.
   */
  onAddCategory: (label: string | LocalizedString) => Promise<Category | null>;
  /** Rename a category. Surfaces an undo toast on a real change. */
  onRenameCategory: (id: string, label: string | LocalizedString) => Promise<boolean>;
  /** Remove a category. Surfaces an undo toast on success. */
  onRemoveCategory: (id: string) => Promise<boolean>;

  // Sections --------------------------------------------------------
  /** Sections with their hidden state filtered out, with admin
   *  overrides applied to the labels (resolved to the active UI
   *  language slot). Pass to Header / MobileDrawer. */
  visibleSectionsWithLabels: Section[];
  /** Predicate — is this section hidden from the public nav? */
  isSectionHidden: (id: SectionId) => boolean;
  /** Setter — show / hide a section in the public nav. */
  setSectionHidden: (id: SectionId, hidden: boolean) => void;
  /**
   * Resolve the admin-overridden label for a section in the active
   * language, falling back to `fallback` when no override is set
   * for either slot.
   */
  getSectionLabel: (id: SectionId, fallback: string) => string;
  /**
   * Set the admin-overridden label for a section. Targets the ES
   * slot by default; pass `slot: "en"` to update the English slot
   * instead. Empty string clears that slot (clearing both slots
   * removes the override entirely).
   */
  setSectionLabel: (id: SectionId, label: string, slot?: "es" | "en") => void;
  /** Map of section id → bilingual override (only the ones with
   *  overrides set). Forward to `derivePageHead` for SEO copy. */
  sectionLabelOverrides: SectionLabelOverrides;
}

/** Read the ES slot of a category label regardless of legacy /
 *  modern shape. Used inside the toast strings — admin notifications
 *  always surface Spanish for editorial consistency. */
function labelEs(label: Category["label"]): string {
  return typeof label === "string" ? label : (label.es ?? "");
}

/**
 * Compose the three admin-config hooks + the toast-wrapped
 * category mutations into one stable bag. The shape is documented
 * in `CatalogConfig` above.
 */
export function useCatalogConfig({ showToast, lang = "es" }: Args): CatalogConfig {
  const {
    categories,
    addCategory,
    renameCategory,
    removeCategory,
    restoreCategory,
    isCustom: isCustomCategory,
    isHidden: isCategoryHidden,
    setHidden: setCategoryHidden,
  } = useCustomCategories();

  const {
    visibleSections,
    isHidden: isSectionHidden,
    setHidden: setSectionHidden,
  } = useHiddenSections();

  const {
    overrides: sectionLabelOverrides,
    getLabel: getSectionLabelRaw,
    setLabel: setSectionLabelRaw,
  } = useSectionLabels();

  // Lang-aware variants for the consumer surface. The hook receives
  // the active language; admin override → dictionary → static label
  // is the resolution chain in `useSectionLabels.getLabel`.
  const getSectionLabel = useMemo(
    () => (id: SectionId, fallback: string) => getSectionLabelRaw(id, fallback, lang),
    [getSectionLabelRaw, lang],
  );

  const setSectionLabel = useMemo(
    () =>
      (id: SectionId, label: string, slot: "es" | "en" = "es") =>
        setSectionLabelRaw(id, label, slot),
    [setSectionLabelRaw],
  );

  // Compose: hide-set ∩ label-overrides. Header / MobileDrawer
  // get the relabeled subset for the active language; the
  // SectionsEditor below sees the raw SECTIONS via its own catalog
  // import.
  const visibleSectionsWithLabels = useMemo<Section[]>(
    () =>
      visibleSections.map((s) => ({
        ...s,
        label: getSectionLabelRaw(s.id, s.label, lang),
      })),
    [visibleSections, getSectionLabelRaw, lang],
  );

  const onAddCategory = async (label: string | LocalizedString) => {
    const created = await addCategory(label);
    if (created) showToast(`Categoría "${labelEs(created.label)}" agregada`);
    return created;
  };

  const onRenameCategory = async (id: string, label: string | LocalizedString) => {
    const before = categories.find((c) => c.id === id);
    const ok = await renameCategory(id, label);
    if (ok && before) {
      // Compare ES slots — that's the editorial canon. EN-only
      // edits don't trip the undo toast (they're additive).
      const beforeEs = labelEs(before.label);
      const incomingEs = typeof label === "string" ? label : (label.es ?? "");
      if (beforeEs !== incomingEs) {
        showToast("Categoría renombrada", {
          undo: () => renameCategory(id, before.label),
        });
      }
    }
    return ok;
  };

  const onRemoveCategory = async (id: string) => {
    const before = categories.find((c) => c.id === id);
    const ok = await removeCategory(id);
    if (ok && before) {
      showToast(`"${categoryLabel(before, lang)}" eliminada`, {
        undo: () => restoreCategory(before),
      });
    } else if (!ok) {
      showToast("No se pudo eliminar la categoría");
    }
    return ok;
  };

  return {
    categories,
    isCustomCategory,
    isCategoryHidden,
    setCategoryHidden,
    onAddCategory,
    onRenameCategory,
    onRemoveCategory,
    visibleSectionsWithLabels,
    isSectionHidden,
    setSectionHidden,
    getSectionLabel,
    setSectionLabel,
    sectionLabelOverrides,
  };
}
