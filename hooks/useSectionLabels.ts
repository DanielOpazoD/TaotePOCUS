"use client";

import { useCallback, useMemo } from "react";
import { usePersistedState } from "./usePersistedState";
import { SECTIONS } from "@/lib/data";
import type { Section, SectionId } from "@/lib/types";

const STORAGE_KEY = "sectionLabelOverrides";

/**
 * Per-section label overrides. The catalog's section ids
 * (`atlas` / `ecg` / `cases` / `info`) are anchored in URL paths
 * and the `SectionId` literal union — they don't change at
 * runtime. But the user-facing **labels** can be renamed by the
 * admin without breaking anything: a "Casos clínicos" → "Historias
 * clínicas" rename is purely cosmetic for the user.
 *
 * Persisted in localStorage as `Record<SectionId, string>`. An
 * empty / whitespace label clears the override (back to the
 * default in `lib/data.ts`).
 *
 * Why client-side: SEO surfaces (sitemap, OG metadata) keep using
 * the static defaults — the override only affects the rendered nav
 * + section hero on the visitor's session. If we wanted globally
 * effective renames we'd promote this to the DB; for now, it's a
 * personalization knob the admin can set per-browser.
 */
export function useSectionLabels() {
  const [overrides, setOverrides] = usePersistedState<Record<string, string>>(
    STORAGE_KEY,
    {},
    {
      deserialize: (raw) => {
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
          // Defensive: drop entries that aren't strings, so a corrupt
          // value can't render as `[object Object]` in the nav.
          const valid: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string" && v.trim()) valid[k] = v;
          }
          return valid;
        } catch {
          return undefined;
        }
      },
    },
  );

  /** Resolve the label for a section id, applying any override. */
  const getLabel = useCallback(
    (id: SectionId, fallback: string): string => overrides[id] ?? fallback,
    [overrides],
  );

  /** Apply a label override. Empty / whitespace clears it (revert
   *  to the default from lib/data.ts). */
  const setLabel = useCallback(
    (id: SectionId, label: string) => {
      const trimmed = label.trim();
      const def = SECTIONS.find((s) => s.id === id)?.label ?? "";
      setOverrides((prev) => {
        const next = { ...prev };
        if (!trimmed || trimmed === def) {
          delete next[id];
        } else {
          next[id] = trimmed;
        }
        return next;
      });
    },
    [setOverrides],
  );

  /** Clone of `SECTIONS` with overrides applied. Use this when
   *  rendering the public nav so the admin's renames flow through
   *  without every consumer importing this hook directly. */
  const sectionsWithLabels = useMemo<Section[]>(
    () => SECTIONS.map((s) => ({ ...s, label: overrides[s.id] ?? s.label })),
    [overrides],
  );

  return { overrides, getLabel, setLabel, sectionsWithLabels };
}
