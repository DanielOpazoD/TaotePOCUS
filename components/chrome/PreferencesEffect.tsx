"use client";

// Zero-render client component. Reads `usePreferences()` and
// mirrors the relevant subset onto `<html>` as data attributes so
// CSS can scope overrides without prop drilling.
//
// Applied:
//   - `data-density` = "comfortable" | "compact"  → CSS adjusts
//     card padding / gap / line-height via descendant selectors.
//   - `data-reduced-motion` = "auto" | "always" → "always" disables
//     transitions even when the system media query is off. CSS
//     scopes the existing `@media (prefers-reduced-motion: reduce)`
//     overrides to ALSO fire when this attribute is "always".
//
// Why a side-effect component instead of inline JSX: the `<html>`
// element belongs to the root layout (a Server Component) which
// can't read localStorage. A tiny client mount fixes that without
// turning the entire layout into "use client".
//
// Returns null — DOM contribution is on `documentElement`.

import { useEffect } from "react";
import { usePreferences } from "@/hooks/usePreferences";

export function PreferencesEffect() {
  const { prefs } = usePreferences();
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-density", prefs.density);
    root.setAttribute("data-reduced-motion", prefs.reducedMotion);
    // No cleanup: when the user logs out / the layout unmounts (which
    // basically only happens on full nav), the next render will
    // re-apply from the default values anyway. Leaving stale attrs
    // on the `<html>` during a fast reload is harmless.
  }, [prefs.density, prefs.reducedMotion]);
  return null;
}
