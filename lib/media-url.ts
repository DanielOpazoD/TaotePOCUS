// Pure URL helpers for the media subsystem. No runtime dependencies
// — safe to import from any context (server, client, scripts, tests).
//
// The `@netlify/blobs` package itself can only run server-side, so
// `lib/blobs.ts` (which uses `getStore`) shouldn't end up in the
// client bundle. Splitting these helpers out keeps the boundary
// clean: `lib/blobs.ts` for the store, `lib/media-url.ts` for the
// pure functions.

/**
 * Returns the public URL where a given media key is served from. Use
 * this when you need to construct an URL outside the catalog (e.g. in
 * an `apply-twitter-import.mjs` template or a one-off migration).
 *
 * Inside the app, `<CaseRecord>.media.src` already holds the URL
 * directly — no need to call this.
 */
export function mediaUrl(key: string): string {
  return `/api/media/${encodeURIComponent(key)}`;
}

/**
 * Inverse of `mediaUrl`: extract the blob key from a `media.src` URL.
 * Returns `null` for URLs that don't point at our blob route — those
 * can't be deleted from the store (e.g. base64 data URLs from admin-
 * uploaded cases, or the legacy `/imports/<id>` paths if any survive).
 */
export function mediaKeyFromSrc(src: string | undefined | null): string | null {
  if (!src) return null;
  // Match either `/api/media/<key>` or the legacy `/imports/<key>`
  // (the latter so an early-import bug doesn't strand files).
  const m = src.match(/^\/api\/media\/([^?#]+)/) ?? src.match(/^\/imports\/([^?#]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return m[1] ?? null;
  }
}
