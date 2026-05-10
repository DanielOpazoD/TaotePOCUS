"use client";

// Admin-managed thumbnail focus defaults. Persisted in localStorage,
// keyed by `STORAGE_KEYS.focusDefaults`. Three scope layers:
//
//   - Global default (single FocusValue or empty)
//   - Per-section overrides
//   - Per-category overrides
//
// The pure resolver lives in `lib/focus.ts`; this hook owns the React
// state + persistence + setter API so admin panels and tests can
// reach it without spelling out the storage key.
//
// Mirrors the shape of `useHiddenSections` / `useSectionLabels`: one
// `usePersistedState` slot, defensive deserializer, narrow setter
// surface. The deserializer drops obviously-corrupt entries (wrong
// shape, NaN values) so a bad write can't hose the rest of the app.

import { useCallback } from "react";
import { usePersistedState } from "./usePersistedState";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { FocusDefaults, FocusValue, SectionId } from "@/lib/types";

const STORAGE_KEY = STORAGE_KEYS.focusDefaults;
const DEFAULT_VALUE: FocusDefaults = {};

/** Defensive validator for a single FocusValue payload. Drops
 *  unrecognised values, clamps the canonical fields to their stated
 *  ranges so a corrupt entry can't render a 1000× zoom or a
 *  -50/-50 object position. Returns `undefined` when no valid
 *  field survives — caller treats that as "slot omitted". */
function sanitizeFocusValue(input: unknown): FocusValue | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const out: FocusValue = {};
  if (typeof raw.x === "number" && Number.isFinite(raw.x)) {
    out.x = Math.max(0, Math.min(100, raw.x));
  }
  if (typeof raw.y === "number" && Number.isFinite(raw.y)) {
    out.y = Math.max(0, Math.min(100, raw.y));
  }
  if (typeof raw.scale === "number" && Number.isFinite(raw.scale)) {
    out.scale = Math.max(0.5, Math.min(3, raw.scale));
  }
  // Empty object is a valid "explicit reset" — keep it so the
  // resolver's slot-present-but-empty semantics survive.
  return out;
}

/** Defensive deserializer for the persisted blob. Anything we don't
 *  recognise gets dropped without throwing — the hook then renders
 *  with `DEFAULT_VALUE` as if the key weren't set. */
function deserialize(raw: string): FocusDefaults | undefined {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    const next: FocusDefaults = {};
    const obj = parsed as Record<string, unknown>;

    const global = sanitizeFocusValue(obj.global);
    if (global) next.global = global;

    if (obj.sections && typeof obj.sections === "object") {
      const sections: Partial<Record<SectionId, FocusValue>> = {};
      for (const [k, v] of Object.entries(obj.sections as Record<string, unknown>)) {
        const value = sanitizeFocusValue(v);
        if (value) sections[k as SectionId] = value;
      }
      if (Object.keys(sections).length > 0) next.sections = sections;
    }

    if (obj.categories && typeof obj.categories === "object") {
      const categories: Record<string, FocusValue> = {};
      for (const [k, v] of Object.entries(obj.categories as Record<string, unknown>)) {
        const value = sanitizeFocusValue(v);
        if (value) categories[k] = value;
      }
      if (Object.keys(categories).length > 0) next.categories = categories;
    }

    return next;
  } catch {
    return undefined;
  }
}

/**
 * Admin focus defaults — read + write API.
 *
 * Returns:
 *   - `defaults`: the current `FocusDefaults` blob.
 *   - `setGlobal(value)`: set / clear the global slot.
 *   - `setSection(id, value)`: set / clear a per-section slot. Pass
 *     `undefined` to remove (revert to global / hardcoded).
 *   - `setCategory(id, value)`: set / clear a per-category slot.
 *
 * `value === undefined` clears the slot entirely so the resolver
 * falls through. An explicit `{}` (empty object) keeps the slot but
 * means "centered / no zoom" — useful when the admin wants a
 * narrower scope to BREAK an inherited wider default.
 */
export function useFocusDefaults() {
  const [defaults, setDefaults] = usePersistedState<FocusDefaults>(STORAGE_KEY, DEFAULT_VALUE, {
    deserialize,
  });

  const setGlobal = useCallback(
    (value: FocusValue | undefined) => {
      setDefaults((prev) => {
        const next = { ...prev };
        if (value === undefined) delete next.global;
        else next.global = value;
        return next;
      });
    },
    [setDefaults],
  );

  const setSection = useCallback(
    (id: SectionId, value: FocusValue | undefined) => {
      setDefaults((prev) => {
        const sections = { ...(prev.sections ?? {}) };
        if (value === undefined) delete sections[id];
        else sections[id] = value;
        const next: FocusDefaults = { ...prev };
        if (Object.keys(sections).length === 0) delete next.sections;
        else next.sections = sections;
        return next;
      });
    },
    [setDefaults],
  );

  const setCategory = useCallback(
    (id: string, value: FocusValue | undefined) => {
      setDefaults((prev) => {
        const categories = { ...(prev.categories ?? {}) };
        if (value === undefined) delete categories[id];
        else categories[id] = value;
        const next: FocusDefaults = { ...prev };
        if (Object.keys(categories).length === 0) delete next.categories;
        else next.categories = categories;
        return next;
      });
    },
    [setDefaults],
  );

  /** Wipe every slot (global + sections + categories). Used by the
   *  panel's "reset all" affordance. */
  const reset = useCallback(() => {
    setDefaults(DEFAULT_VALUE);
  }, [setDefaults]);

  return {
    defaults,
    setGlobal,
    setSection,
    setCategory,
    reset,
  };
}
