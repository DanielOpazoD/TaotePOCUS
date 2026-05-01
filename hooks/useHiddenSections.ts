"use client";

import { useCallback, useMemo } from "react";
import { usePersistedState } from "./usePersistedState";
import { SECTIONS } from "@/lib/data";
import type { Section, SectionId } from "@/lib/types";

const STORAGE_KEY = "hiddenSectionIds";

/**
 * The set of sections hidden by default for a fresh visitor (i.e. when
 * `localStorage["hiddenSectionIds"]` doesn't yet exist). The admin can
 * un-hide any of these inside Administrar → Secciones; the un-hide is
 * persisted, so subsequent visits respect the admin's choice.
 *
 * Currently:
 *   - "cases" — Casos clínicos. The section was redesigned in May-2026
 *     and is hidden from the public nav while content is being curated.
 */
const DEFAULT_HIDDEN: SectionId[] = ["cases"];

/**
 * Admin-managed visibility for the four top-level sections (Atlas / ECG
 * / Casos clínicos / Infografías). Mirrors the shape of
 * `useCustomCategories.isHidden` / `setHidden`: a hidden section is
 * filtered out of the public nav rails (Header + MobileDrawer) but
 * keeps working via direct URL — so deep links and the admin's own
 * navigation aren't broken by the toggle.
 *
 * Persistence is per-browser (localStorage). The initial state for a
 * fresh visit defaults to `["cases"]` so the public nav doesn't link
 * to the half-curated Casos clínicos section. The admin un-hides it
 * via Administrar → Secciones; the un-hide is persisted.
 *
 * Returns:
 *   - `hiddenSections`: the raw id list (rarely needed by callers).
 *   - `visibleSections`: `SECTIONS` minus the hidden ones, in catalog
 *     order. This is the prop you forward to Header / MobileDrawer.
 *   - `isHidden(id)`: predicate. Used by the admin editor row.
 *   - `setHidden(id, hidden)`: toggle a single section's visibility.
 *
 * The hook is intentionally narrow — it doesn't know about routing or
 * the admin tab UI. The App composes it with the page-level layout
 * the same way it composes `useCustomCategories`.
 */
export function useHiddenSections() {
  const [hiddenIds, setHiddenIds] = usePersistedState<SectionId[]>(STORAGE_KEY, DEFAULT_HIDDEN, {
    deserialize: (raw) => {
      try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return undefined;
        // Defensive: drop unknown ids so a corrupt entry can't hide
        // every section. The cast is checked against the catalog.
        const valid = new Set<SectionId>(SECTIONS.map((s) => s.id));
        return arr.filter(
          (x): x is SectionId => typeof x === "string" && valid.has(x as SectionId),
        );
      } catch {
        return undefined;
      }
    },
  });

  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const isHidden = useCallback((id: SectionId) => hiddenSet.has(id), [hiddenSet]);

  const setHidden = useCallback(
    (id: SectionId, hidden: boolean) => {
      setHiddenIds((prev) => {
        const set = new Set(prev);
        if (hidden) set.add(id);
        else set.delete(id);
        // Preserve catalog order so the persisted shape stays stable
        // across toggles. Important for diffing in the test suite and
        // for any admin who reads the localStorage value directly.
        return SECTIONS.map((s) => s.id).filter((x) => set.has(x));
      });
    },
    [setHiddenIds],
  );

  const visibleSections = useMemo<Section[]>(
    () => SECTIONS.filter((s) => !hiddenSet.has(s.id)),
    [hiddenSet],
  );

  return {
    hiddenSections: hiddenIds,
    visibleSections,
    isHidden,
    setHidden,
  };
}
