"use client";

// Stable per-card callbacks for the catalog grid + the
// FeaturedRow. Pulled out of `App.tsx` so the orchestrator stays
// focused on state composition and the card surfaces receive the
// SAME function identity on every render — without that, the
// `React.memo` wrap on `<CaseCard>` would invalidate on every
// orchestrator render and the navigation perf gains from commit
// 44a624b would regress.
//
// The deps are intentionally stable too — `pushPatch` /
// `replacePatch` from `useViewState` are already `useCallback`-
// wrapped, and `toggleFav` from `useFavs` likewise.

import { useCallback } from "react";
import type { CaseRecord, View } from "@/lib/types";
import type { ViewPatch } from "@/lib/url";

interface Args {
  pushPatch: (patch: ViewPatch) => void;
  replacePatch: (patch: ViewPatch) => void;
  toggleFav: (id: string) => void;
}

export interface CardCallbacks {
  /** Open the modal for a case (adds a history entry so back closes it). */
  onCardOpen: (c: CaseRecord) => void;
  /** Toggle a case's fav state. Stable identity. */
  onCardToggleFav: (c: CaseRecord) => void;
  /** Clear all filters on the current section. */
  onClearFiltersCb: () => void;
  /** Navigate to /atlas (used by the favs empty-state CTA). */
  onExploreAtlasCb: () => void;
}

export function useCardCallbacks({ pushPatch, replacePatch, toggleFav }: Args): CardCallbacks {
  const onCardOpen = useCallback(
    // Plain state change — the modal opens via its own CSS
    // entrance animations (`.modal` scale-in + `::backdrop` fade-
    // in + `dialog[open]` fade-in). The View Transitions
    // card→modal morph was originally wired here and gave a slick
    // "card grows into the modal" gesture, BUT it caused a
    // persistent visual flicker (the catalog row briefly visible
    // overlapping the modal during the morph). Four separate
    // fixes (decoupled OLD/NEW timing, `instantRoot` root snap-
    // cut, suppressed modal entrance animations during the
    // transition, `useLayoutEffect` so `showModal()` ran before
    // the NEW snapshot) all failed to fully eliminate the flicker.
    //
    // Reverting to a plain CSS-only entrance is the reliable
    // path: dialog fades in, modal scales in, backdrop fades.
    // The slick morph is gone but the open is now visually
    // predictable on every browser. If we ever revisit the
    // morph, do it behind a feature flag and validate on real
    // devices before shipping — theory-based debugging on this
    // pattern has been fruitless.
    (c: CaseRecord) => pushPatch({ caso: c.id }),
    [pushPatch],
  );
  const onCardToggleFav = useCallback((c: CaseRecord) => toggleFav(c.id), [toggleFav]);
  const onClearFiltersCb = useCallback(
    () => replacePatch({ cat: null, tags: [], query: "" }),
    [replacePatch],
  );
  const onExploreAtlasCb = useCallback(
    () => replacePatch({ view: { kind: "section", section: "atlas" } as View }),
    [replacePatch],
  );

  return { onCardOpen, onCardToggleFav, onClearFiltersCb, onExploreAtlasCb };
}
