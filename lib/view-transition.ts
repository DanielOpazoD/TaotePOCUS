// View Transitions API helper. Wraps a state-change callback in
// `document.startViewTransition()` when the API is available AND
// the user hasn't opted out of motion.
//
// The View Transitions API (Chrome 111+, Edge 111+, Safari 18+,
// Firefox 138+) lets the browser auto-morph between two DOM
// snapshots: it captures elements with matching `view-transition-name`
// before/after a state change and animates between their positions.
// We use this to morph the clicked `.case-thumb` into the case
// modal's hero loop — the card "grows into" the modal.
//
// Scope: currently used ONLY on the OPEN path
// (`useCardCallbacks.onCardOpen`). The close path runs a plain
// snap-cut state change. Closing the modal via the helper too was
// originally implemented but introduced flake in CI headless
// Chromium where the transition's "wait for next paint" raced with
// subsequent modal mounts (notably the auth modal in
// `e2e/admin.spec.ts`) — Playwright saw `element was detached`
// mid-action. Re-enable on close once that race is understood and
// addressed (probably a `transition.finished` await before allowing
// the next user action).
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
 * otherwise. Callers rarely need the return value; it's exposed for
 * future enhancements (chaining `.finished` to clean up post-anim).
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

/**
 * Stable name for a case's morphing target. Used by:
 *   - `.case-thumb` on `<CaseCard>` and `<FeaturedCard>` (the
 *     OLD-state element).
 *   - The modal's hero loop wrapper (the NEW-state element).
 *
 * Each name MUST be unique at any snapshot — that's why we encode
 * the case id and the consumers conditionally suppress the name
 * (to `"none"`) when the card matches the currently-open case.
 * Otherwise both card + modal would carry the same name in the same
 * DOM at the same time, and the browser would refuse to capture.
 */
export function caseThumbViewTransitionName(caseId: string): string {
  // `view-transition-name` only accepts CSS-identifier-safe values.
  // Case ids are typically nanoid-ish (e.g., `tw-12345`) — already
  // safe. Replace anything else with `_` defensively.
  const safe = caseId.replace(/[^A-Za-z0-9_-]/g, "_");
  return `case-thumb-${safe}`;
}
