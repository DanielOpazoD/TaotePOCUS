// View Transitions API helper. Wraps a state-change callback in
// `document.startViewTransition()` when the API is available AND
// the user hasn't opted out of motion.
//
// The View Transitions API (Chrome 111+, Edge 111+, Safari 18+,
// Firefox 138+) lets the browser auto-morph between two DOM
// snapshots: it captures elements with matching `view-transition-name`
// before/after a state change and animates between their positions.
//
// Scope (May-2026): currently NO direct callers. The modal-open
// path was the original consumer but its `case-thumb-<id>` morph
// caused a persistent flicker that survived four targeted fixes
// (#75–#78); PR #79 ripped it out in favor of plain CSS modal
// entrance animations. Page-to-page navigation via
// `components/chrome/TransitionLink.tsx` calls
// `document.startViewTransition` inline rather than through this
// helper.
//
// The helper is kept (rather than deleted) for two reasons:
//   1. It has well-tested feature-detection + reduced-motion
//      fallback behavior. If TransitionLink or a future caller
//      wants those guarantees, importing here is cheaper than
//      re-implementing.
//   2. Future transitions (drawer open, theme toggle, filter
//      morph) likely want the same detection logic. One seam.
//
// Why a helper instead of inline calls:
//
//   1. **Feature detection.** Firefox <138 / Safari <18 / old
//      browsers don't expose `document.startViewTransition`. The
//      helper falls back to a plain function call so the
//      animation is purely additive — no behavior breaks.
//
//   2. **Reduced motion.** Users with `prefers-reduced-motion:
//      reduce` get the snap-cut state change, not the morphing
//      animation. Matches the discipline applied throughout the
//      rest of the app (heart-burst, hover lifts, skeleton
//      shimmer).
//
//   3. **Single seam.** When we add more transitions later (page-
//      to-page, drawer open, theme toggle) they share the same
//      detection / fallback logic.

/**
 * Best-effort view-transition wrapper. Calls `callback` synchronously
 * either way:
 *   - If the browser supports the API AND the user accepts motion,
 *     the callback runs inside `document.startViewTransition`. The
 *     browser snapshots the DOM before + after and animates between
 *     matched `view-transition-name` elements.
 *   - Otherwise the callback runs directly (no transition).
 *
 * The callback is ALWAYS invoked — the helper never swallows it.
 * Returns the `ViewTransition` instance when the API runs, `null`
 * otherwise.
 */
export function runWithViewTransition(callback: () => void): ViewTransition | null {
  if (typeof document === "undefined") {
    // SSR / non-browser context. Just run the callback.
    callback();
    return null;
  }
  const supportsAPI =
    typeof (document as Document & { startViewTransition?: unknown }).startViewTransition ===
    "function";
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!supportsAPI || prefersReducedMotion) {
    callback();
    return null;
  }
  // The cast goes through because we just feature-detected
  // `startViewTransition`. The lib.dom types may lag the API depending
  // on the TypeScript version installed.
  const startFn = (
    document as Document & {
      startViewTransition: (cb: () => void) => ViewTransition;
    }
  ).startViewTransition;
  return startFn.call(document, callback);
}

/**
 * The transition object returned by `document.startViewTransition`.
 * Mirrors the spec — re-declared here so callers don't depend on the
 * exact lib.dom version. `finished` / `ready` are exposed for the
 * (rare) caller that needs to chain post-animation cleanup.
 */
export interface ViewTransition {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
}
