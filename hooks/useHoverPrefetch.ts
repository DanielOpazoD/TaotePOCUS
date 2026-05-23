"use client";

// Hover-to-prefetch hook for the catalog cards.
//
// The most frequent interaction in the catalog is "open a case." On
// a fresh visit (or a section the user just navigated into), the
// media for the case-modal target is NOT yet in the browser cache:
// the grid card uses `preload="metadata"` for videos and a sized
// thumbnail for images, neither of which downloads the full asset.
// Clicking the card mounts the modal, the modal mounts its own
// CineLoop with the full-quality flag, and the browser starts a
// fresh download — for 300–800ms (typical case on a phone over
// 4G), the modal renders the cine-spinner over a still frame
// before the loop is actually ready.
//
// The fix is the same trick Amazon / Airbnb / YouTube use on every
// thumbnail: when the pointer enters the card AND stays for a brief
// window of "intent" (~150 ms — enough to filter out scroll-by
// hovers), fire off the asset fetch in the background. The browser
// caches the response, and when the user clicks 100–500 ms later,
// the modal mount hits the cache and paints instantly.

import { useCallback, useEffect, useRef } from "react";
import type { Media } from "@/lib/types";

/** Cap on the number of URLs we remember as "already prefetched".
 *  Catalog visits don't usually touch more than ~50 cards, so 256
 *  comfortably covers a long browsing session while bounding memory.
 *  When the cap is hit, FIFO eviction drops the oldest entry — if the
 *  user re-hovers that URL the prefetch fires again (which is fine;
 *  the browser HTTP cache likely still has the asset, so the second
 *  fetch is a 304 round-trip at worst). */
const PREFETCH_CACHE_CAP = 256;

/** URLs that have already been prefetched in this session. Module-
 *  level Map so multiple cards / re-mounts don't fire duplicate
 *  fetches against the same asset — the browser would dedupe at the
 *  network layer anyway, but skipping the function call entirely
 *  is cheaper and keeps DevTools clean.
 *
 *  Using `Map` instead of `Set` for two reasons: (1) Maps preserve
 *  insertion order so we can FIFO-evict by reading `.keys().next()`,
 *  and (2) the bounded size prevents unbounded growth across a long
 *  session that visits hundreds of cards (each adds one URL; with the
 *  prior `Set` the only release path was an explicit
 *  `__resetPrefetchCacheForTests` call). The value side of the Map
 *  is unused (we just need the key set) so we store `true`. */
const prefetchedUrls = new Map<string, true>();

/** Mark `url` as prefetched, evicting the oldest entry when the cap
 *  is hit. FIFO (not strict LRU) — we only care about the memory
 *  bound, not "hottest URLs stay resident." */
function rememberPrefetch(url: string): void {
  if (prefetchedUrls.size >= PREFETCH_CACHE_CAP) {
    const oldest = prefetchedUrls.keys().next().value;
    if (oldest !== undefined) prefetchedUrls.delete(oldest);
  }
  prefetchedUrls.set(url, true);
}

/**
 * Schedule `url` for prefetch (idempotent). Uses `fetch` instead of
 * `<link rel="prefetch">` because we want this to be a high-priority
 * speculative load gated by the user's hover intent, not a quiet
 * idle-time hint. The `/api/media/<id>` route ships `Cache-Control:
 * public, max-age=31536000, immutable`, so a subsequent `<video src>`
 * or `<img src>` hits the HTTP cache instead of opening a fresh
 * connection — net effect: modal media paints in the same frame as
 * the wrapper mounts.
 *
 * Errors are swallowed: a failed prefetch just means the user pays
 * the original on-demand cost. Same trade we already accepted for
 * the lazy-modal preload in `<AppModals>`.
 */
function prefetchMedia(url: string): void {
  if (typeof window === "undefined" || !url) return;
  if (prefetchedUrls.has(url)) return;
  rememberPrefetch(url);
  // `keepalive` is harmless here but lets the browser continue the
  // request if the page navigates before it completes — useful when
  // the hover IS the prelude to a click that triggers a route change.
  fetch(url, { credentials: "same-origin", keepalive: true }).catch(() => {
    // Roll back the dedupe so a future hover can retry. This handles
    // the (rare) transient case — most failures here are permanent
    // (404, CORS, etc.) and the retry-on-hover policy is fine.
    prefetchedUrls.delete(url);
  });
}

export interface HoverPrefetchHandlers {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

/**
 * Returns pointer handlers a card surface plugs into its outer
 * wrapper. Fires `prefetchMedia(media.src)` after the pointer has
 * been over the card for `delayMs` (default 150) — enough to filter
 * out scroll-by hovers, fast enough to land the fetch before the
 * user clicks. Leaves before the threshold cancel the timer.
 *
 * No-op when:
 *   - `media` is undefined / has no src (synthetic loop, no asset
 *     to prefetch).
 *   - Already prefetched (deduped at module scope).
 *   - SSR / non-browser context.
 *
 * The hook is intentionally pointer-event based (not mouse-only) so
 * stylus + pen devices benefit too. Touch devices don't emit
 * pointerenter without a hover state, so they keep the on-demand
 * fetch path — fine, the modal still works the same.
 */
export function useHoverPrefetch(media: Media | undefined, delayMs = 150): HoverPrefetchHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount — a card that fades out mid-hover shouldn't
  // leave a stray timer pointing at gone memory.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const onPointerEnter = useCallback(() => {
    const src = media?.src;
    if (!src) return;
    if (prefetchedUrls.has(src)) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      prefetchMedia(src);
    }, delayMs);
  }, [media?.src, delayMs]);

  const onPointerLeave = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { onPointerEnter, onPointerLeave };
}

// Exported for unit tests so the dedupe Set can be reset between
// test cases. NEVER call from production code.
export function __resetPrefetchCacheForTests(): void {
  prefetchedUrls.clear();
}
