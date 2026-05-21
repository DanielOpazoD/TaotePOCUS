"use client";

// Single source of truth for the per-device preferences surface
// (`SettingsPanel`). Three knobs live here today:
//
//   - `autoplay`: should videos auto-play on visible (legacy behavior)
//     or stay play-on-demand (PR #109 default)?
//   - `density`: `"comfortable"` | `"compact"` — overall card +
//     padding tightness.
//   - `reducedMotion`: `"auto"` (honors the OS media query) |
//     `"always"` (force-on regardless of system pref).
//
// Persistence: a single JSON blob in `localStorage` under
// `STORAGE_KEYS.preferences`. One read + one write per change keeps
// the shape coherent (vs. one key per pref which drifts as new
// prefs are added).
//
// SSR / hydration: returns the defaults during SSR (no window).
// The first client render reconciles from localStorage in a
// `useEffect` so the markup matches server output, avoiding the
// hydration-mismatch warning. The settings panel only renders
// post-hydration so end-users never see the brief default flash.
//
// Cross-tab sync: subscribes to the `storage` event so opening the
// app in two tabs and changing density in one updates the other.

import { useCallback, useEffect, useState } from "react";
import { STORAGE_KEYS } from "@/lib/storage-keys";

export interface Preferences {
  autoplay: boolean;
  density: "comfortable" | "compact";
  reducedMotion: "auto" | "always";
}

export const DEFAULT_PREFERENCES: Preferences = {
  autoplay: false,
  density: "comfortable",
  reducedMotion: "auto",
};

/** Safe read with shape validation. Anything missing or malformed
 *  falls back to the default for that field; we never throw on
 *  user-supplied input. */
export function readPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.preferences);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      autoplay:
        typeof parsed.autoplay === "boolean" ? parsed.autoplay : DEFAULT_PREFERENCES.autoplay,
      density:
        parsed.density === "compact" || parsed.density === "comfortable"
          ? parsed.density
          : DEFAULT_PREFERENCES.density,
      reducedMotion:
        parsed.reducedMotion === "always" || parsed.reducedMotion === "auto"
          ? parsed.reducedMotion
          : DEFAULT_PREFERENCES.reducedMotion,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Persist the entire blob. Callers update via `setPreference(key,
 *  value)` (below) which read-modify-writes; direct writes are
 *  exported for the test surface and the offline-purge flow. */
export function writePreferences(prefs: Preferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(prefs));
    // Broadcast on the storage event channel — same-tab listeners
    // get the new value without waiting for the cross-tab signal
    // (the `storage` event only fires on OTHER tabs).
    window.dispatchEvent(new CustomEvent("pocus-preferences-changed", { detail: prefs }));
  } catch {
    // Quota / private-mode lockout. Caller is expected to operate
    // in-memory if persistence fails; the React state below still
    // reflects the user's choice for this session.
  }
}

interface UsePreferencesReturn {
  prefs: Preferences;
  /** Set a single pref by key. Read-modify-writes the persisted
   *  blob so other fields aren't clobbered. */
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

export function usePreferences(): UsePreferencesReturn {
  // Initial state: defaults during SSR, real values on client first
  // render (set via the useEffect below — see the comment on the
  // hook header for the hydration rationale).
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPrefs(readPreferences());
    // Cross-tab + same-tab change subscription. The custom event is
    // dispatched by `writePreferences` above; the `storage` event is
    // the native cross-tab channel (only fires on OTHER tabs).
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<Preferences>).detail;
      if (detail) setPrefs(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.preferences) return;
      setPrefs(readPreferences());
    };
    window.addEventListener("pocus-preferences-changed", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pocus-preferences-changed", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setPreference = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      setPrefs((curr) => {
        const next = { ...curr, [key]: value };
        writePreferences(next);
        return next;
      });
    },
    [],
  );

  return { prefs, setPreference };
}
