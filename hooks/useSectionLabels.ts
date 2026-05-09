"use client";

import { useCallback, useMemo } from "react";
import { usePersistedState } from "./usePersistedState";
import { SECTIONS } from "@/lib/data";
import { sectionLabel as defaultSectionLabel, type Lang } from "@/lib/i18n";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { LocalizedString, Section, SectionId } from "@/lib/types";

const STORAGE_KEY = STORAGE_KEYS.sectionLabelOverrides;

/**
 * Per-section label overrides. The catalog's section ids
 * (`atlas` / `ecg` / `cases` / `info`) are anchored in URL paths
 * and the `SectionId` literal union — they don't change at
 * runtime. But the user-facing **labels** can be renamed by the
 * admin without breaking anything: a "Casos clínicos" → "Historias
 * clínicas" rename is purely cosmetic for the user.
 *
 * Persisted shape: `Record<SectionId, LocalizedString>`. Phase-3 i18n
 * widened the legacy `Record<SectionId, string>` to a bilingual slot
 * so the admin can give each section a Spanish + optional English
 * rename. Legacy entries (plain string) are normalized lazily on
 * read, and an empty / whitespace label clears the override (back
 * to the default in `lib/data.ts` + the i18n dictionary).
 *
 * Why client-side: SEO surfaces (sitemap, OG metadata) keep using
 * the static defaults — the override only affects the rendered nav
 * + section hero on the visitor's session. If we wanted globally
 * effective renames we'd promote this to the DB; for now, it's a
 * personalization knob the admin can set per-browser.
 */

/** Coerce a persisted override entry into the modern bilingual shape.
 *  Legacy plain strings are wrapped into `{ es: ... }`. */
function normalizeOverride(value: unknown): LocalizedString | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? { es: trimmed } : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const es = typeof obj.es === "string" ? obj.es.trim() : "";
    const en = typeof obj.en === "string" ? obj.en.trim() : "";
    if (!es && !en) return null;
    const out: LocalizedString = { es };
    if (en) out.en = en;
    return out;
  }
  return null;
}

export type SectionLabelOverrides = Partial<Record<SectionId, LocalizedString>>;

export function useSectionLabels() {
  const [overrides, setOverrides] = usePersistedState<SectionLabelOverrides>(
    STORAGE_KEY,
    {},
    {
      deserialize: (raw) => {
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
          // Defensive normalization: each entry can be a legacy
          // plain string OR a `LocalizedString`. Drop entries that
          // can't produce a non-empty ES or EN slot — a malformed
          // value can't render as `[object Object]` in the nav.
          const valid: SectionLabelOverrides = {};
          for (const [k, v] of Object.entries(parsed)) {
            const normalized = normalizeOverride(v);
            if (normalized) valid[k as SectionId] = normalized;
          }
          return valid;
        } catch {
          return undefined;
        }
      },
    },
  );

  /**
   * Resolve the label for a section id, applying any override and
   * picking the slot for the active language with EN→ES fallback.
   * The legacy callers (server render, sitemap) still pass `"es"`
   * implicitly via the default; the React tree threads the live
   * language through `useLanguage`.
   */
  const getLabel = useCallback(
    (id: SectionId, fallback: string, lang: Lang = "es"): string => {
      const override = overrides[id];
      if (override) {
        if (lang === "en" && override.en && override.en.length > 0) return override.en;
        if (override.es && override.es.length > 0) return override.es;
      }
      return fallback;
    },
    [overrides],
  );

  /**
   * Apply a label override for a single language slot. Empty /
   * whitespace clears that slot; clearing both slots removes the
   * override entirely (revert to the i18n dictionary + the static
   * default in `lib/data.ts`).
   */
  const setLabel = useCallback(
    (id: SectionId, label: string, slot: "es" | "en" = "es") => {
      const trimmed = label.trim();
      const def = SECTIONS.find((s) => s.id === id)?.label ?? "";
      setOverrides((prev) => {
        const next: SectionLabelOverrides = { ...prev };
        const current = next[id];
        if (slot === "es") {
          if (!trimmed || trimmed === def) {
            // Drop the ES slot. Keep EN if it stands alone.
            if (current?.en) {
              next[id] = { es: "", en: current.en };
            } else {
              delete next[id];
            }
          } else {
            next[id] = { es: trimmed, ...(current?.en ? { en: current.en } : {}) };
          }
        } else {
          // EN slot.
          if (!trimmed) {
            // Drop the EN slot. Keep ES if it has content.
            if (current?.es) {
              next[id] = { es: current.es };
            } else {
              delete next[id];
            }
          } else {
            next[id] = {
              es: current?.es ?? "",
              en: trimmed,
            };
          }
        }
        return next;
      });
    },
    [setOverrides],
  );

  /**
   * Clone of `SECTIONS` with overrides applied. Use this when
   * rendering the public nav so the admin's renames flow through
   * without every consumer importing this hook directly. The lang
   * arg threads through to `getLabel`; defaults to ES so existing
   * callers that haven't been threaded yet keep working.
   */
  const sectionsWithLabels = useCallback(
    (lang: Lang = "es"): Section[] =>
      SECTIONS.map((s) => ({
        ...s,
        label: getLabel(s.id, defaultSectionLabel(s.id, lang), lang),
      })),
    [getLabel],
  );

  // Legacy memoized accessor — kept for back-compat with callers
  // that don't yet thread `lang` (server render, focused tests).
  // Always resolves to Spanish baseline.
  const sectionsWithLabelsEs = useMemo<Section[]>(
    () => sectionsWithLabels("es"),
    [sectionsWithLabels],
  );

  return {
    overrides,
    getLabel,
    setLabel,
    sectionsWithLabels: sectionsWithLabelsEs,
    sectionsForLang: sectionsWithLabels,
  };
}
