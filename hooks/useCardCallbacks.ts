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
import { runWithViewTransition } from "@/lib/view-transition";

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
    (c: CaseRecord) =>
      // Wrap the URL-state change in a view transition. The browser
      // captures snapshots of the matched `.case-thumb` (named
      // `case-thumb-<id>`) BEFORE the modal mounts and the same
      // name on the modal's hero AFTER it mounts, then morphs
      // between them — the card "grows into" the modal. Falls
      // through to a plain state change on browsers without the
      // API or for users with `prefers-reduced-motion: reduce`.
      //
      // `instantRoot: true` snaps the BACKGROUND root layer instead
      // of cross-fading it. Without this, the OLD root snapshot
      // (catalog grid visible) cross-faded into the NEW root
      // snapshot (modal + backdrop) over ~250ms; during the
      // overlap the user saw the catalog thumbnails bleeding
      // through the modal's white background. The named-pair morph
      // (card → modal hero) is still the smooth gesture; only the
      // root layer behind it snap-cuts.
      runWithViewTransition(() => pushPatch({ caso: c.id }), { instantRoot: true }),
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
