// Process-lifetime cache of "URLs we've successfully painted at
// least once during this page session". Used by `<CineLoop>` to
// skip the loading spinner on remount.
//
// **Why a separate cache is needed**: the BROWSER's HTTP cache
// already holds the actual bytes — when a user filters the catalog
// (Atlas: "cardiac" → "pulmonary") and the unfiltered set comes
// back, the `<img>` element re-issues the same URL and the browser
// paints it instantly from cache. The PROBLEM is React: CineLoop's
// `loaded` state lives in component state, which evaporates on
// unmount. When the card remounts, `loaded` starts at `false`, the
// skeleton + spinner render for ~1 frame until the `onLoad` event
// fires synchronously from the cache hit, and the user perceives a
// flash of "still loading" even though no network call happened.
//
// This module sidesteps the flash: a module-level `Set<string>`
// tracks which `media.src` URLs we've already seen flip to loaded.
// CineLoop seeds its initial state from the cache — if the URL is
// in the set, `loaded` starts `true` and no spinner ever renders.
//
// **Persistence**: in-memory only, deliberately. Cross-session
// persistence (e.g., to localStorage) would say "we believe this
// is cached" but the browser's HTTP cache might have evicted it
// in the meantime — we'd skip the spinner AND show blank pixels
// while the network call lands. Trusting the browser cache to
// know its own state is simpler and correct.
//
// **Memory**: the catalog has ~330 cases × ~250 bytes per URL =
// ~80KB at full saturation. Negligible. No eviction is implemented.
//
// **Native aspect**: we also cache the resolved native aspect
// ratio per URL so a remounted CineLoop doesn't relayout from the
// caller's `aspect` prop fallback back to the actual aspect
// (which would cause a small visual jump). The aspect is stable
// per source — caching is safe.

export interface MediaCacheEntry {
  /** `true` once `onLoad` / `onLoadedData` has fired at least once
   *  for this URL during the current page session. */
  loaded: boolean;
  /** Resolved `width / height` ratio (e.g., `"16 / 9"`) once known,
   *  or `null` if the consumer never opted into native-aspect mode.
   *  Lets a remounted CineLoop skip the brief "fall back to caller
   *  aspect, then snap to native" relayout. */
  nativeAspect: string | null;
}

const cache = new Map<string, MediaCacheEntry>();

/**
 * Look up the cache entry for a media URL. Returns `undefined` when
 * we haven't seen this URL yet — the consumer should render its
 * normal "loading" UI in that case.
 *
 * Reading is intentionally synchronous and side-effect-free so it's
 * safe to call from `useState` initializers.
 */
export function getMediaCacheEntry(src: string): MediaCacheEntry | undefined {
  if (!src) return undefined;
  return cache.get(src);
}

/**
 * Mark a media URL as loaded. Idempotent — repeated calls update
 * the cached aspect (in case it was unknown at first call and
 * resolved later) but leave `loaded` pinned at `true`.
 *
 * The consumer should call this in its `onLoad` / `onLoadedData`
 * handler, passing the resolved aspect when available.
 */
export function markMediaLoaded(src: string, nativeAspect: string | null = null): void {
  if (!src) return;
  const existing = cache.get(src);
  cache.set(src, {
    loaded: true,
    // Preserve a previously-known aspect if the current call doesn't
    // have one. Useful for the image branch where `onLoad` fires
    // before the native dimensions are read.
    nativeAspect: nativeAspect ?? existing?.nativeAspect ?? null,
  });
}

/**
 * Test helper. Production code should never need to clear the cache
 * — it's process-lifetime by design, and a stale "loaded" flag is
 * harmless (the worst case is "we skip the spinner, the browser
 * paints from cache anyway").
 */
export function clearMediaCacheForTests(): void {
  cache.clear();
}

/**
 * Test helper. Returns the current size of the cache.
 */
export function mediaCacheSize(): number {
  return cache.size;
}
