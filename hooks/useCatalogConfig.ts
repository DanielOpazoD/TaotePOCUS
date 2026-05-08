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

import { useMemo } from "react";
import { useCustomCategories } from "./useCustomCategories";
import { useHiddenSections } from "./useHiddenSections";
import { useSectionLabels } from "./useSectionLabels";
import type { Category, Section, SectionId } from "@/lib/types";

interface Args {
  /** Toast surface — used to surface "Categoría renombrada" /
   *  "Categoría eliminada" undo affordances. */
  showToast: (msg: string, opts?: { undo?: () => void; undoLabel?: string }) => void;
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
  /** Add a category. Surfaces a "Categoría agregada" toast on success. */
  onAddCategory: (label: string) => Promise<Category | null>;
  /** Rename a category. Surfaces an undo toast on a real change. */
  onRenameCategory: (id: string, label: string) => Promise<boolean>;
  /** Remove a category. Surfaces an undo toast on success. */
  onRemoveCategory: (id: string) => Promise<boolean>;

  // Sections --------------------------------------------------------
  /** Sections with their hidden state filtered out, with admin
   *  overrides applied to the labels. Pass to Header / MobileDrawer. */
  visibleSectionsWithLabels: Section[];
  /** Predicate — is this section hidden from the public nav? */
  isSectionHidden: (id: SectionId) => boolean;
  /** Setter — show / hide a section in the public nav. */
  setSectionHidden: (id: SectionId, hidden: boolean) => void;
  /** Resolve the admin-overridden label for a section, falling
   *  back to `fallback` when no override is set. */
  getSectionLabel: (id: SectionId, fallback: string) => string;
  /** Set the admin-overridden label for a section. Empty string
   *  clears the override (back to the static default). */
  setSectionLabel: (id: SectionId, label: string) => void;
  /** Map of section id → custom label (only the ones with
   *  overrides set). Forward to `derivePageHead` for SEO copy. */
  sectionLabelOverrides: Record<string, string>;
}

/**
 * Compose the three admin-config hooks + the toast-wrapped
 * category mutations into one stable bag. The shape is documented
 * in `CatalogConfig` above.
 *
 * Toast contract:
 *
 *   - `addCategory`:    success → "Categoría agregada" toast (no
 *     undo — `removeCategory` IS the inverse and is one click
 *     away in the editor row that just appeared).
 *   - `renameCategory`: success → toast with undo to the previous
 *     label.
 *   - `removeCategory`: success → toast with undo via
 *     `restoreCategory`. Failure → "no se pudo eliminar" toast.
 */
export function useCatalogConfig({ showToast }: Args): CatalogConfig {
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
    getLabel: getSectionLabel,
    setLabel: setSectionLabel,
  } = useSectionLabels();

  // Compose: hide-set ∩ label-overrides. Header / MobileDrawer
  // get the relabeled subset; the SectionsEditor below sees the
  // raw SECTIONS via its own catalog import.
  const visibleSectionsWithLabels = useMemo<Section[]>(
    () => visibleSections.map((s) => ({ ...s, label: sectionLabelOverrides[s.id] ?? s.label })),
    [visibleSections, sectionLabelOverrides],
  );

  const onAddCategory = async (label: string) => {
    const created = await addCategory(label);
    if (created) showToast(`Categoría "${created.label}" agregada`);
    return created;
  };

  const onRenameCategory = async (id: string, label: string) => {
    const before = categories.find((c) => c.id === id);
    const ok = await renameCategory(id, label);
    if (ok && before && before.label !== label) {
      showToast("Categoría renombrada", {
        undo: () => renameCategory(id, before.label),
      });
    }
    return ok;
  };

  const onRemoveCategory = async (id: string) => {
    const before = categories.find((c) => c.id === id);
    const ok = await removeCategory(id);
    if (ok && before) {
      showToast(`"${before.label}" eliminada`, {
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
