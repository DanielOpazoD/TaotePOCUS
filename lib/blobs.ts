// Thin wrapper around `@netlify/blobs`. Centralizes the store name and
// a couple of conventions so the rest of the codebase doesn't repeat
// magic strings.
//
// Why a single store: the 326 imported case media files all live in one
// logical bucket. Splitting them by section / kind would just complicate
// the migration and the URL space without any real benefit.
//
// Why we don't expose a public Blob URL directly: Netlify Blobs intentionally
// has no public-URL endpoint — they're served through Functions / Route
// Handlers. The handler at `app/api/media/[id]/route.ts` does the
// streaming + cache-control. That indirection lets us rotate the
// underlying storage later (S3 / Cloudinary / etc.) without touching
// every `src` in the catalog.

import { getStore } from "@netlify/blobs";

/**
 * Name of the store that holds all imported case media. Don't change
 * without a migration — the keys (case ids) are scoped to this name.
 */
export const MEDIA_STORE = "imports";

/**
 * Site-scoped store. Survives across deploys. Reads/writes from
 * Netlify Functions and Server Actions; the local `netlify dev`
 * sandbox emulates this with an in-memory implementation that resets
 * when the dev server restarts.
 *
 * The function defers the call so importing this module from a non-
 * runtime context (e.g. type-only imports, build-time scripts) doesn't
 * trigger the implicit-context error that `getStore` throws when no
 * Netlify environment is wired.
 */
export function mediaStore() {
  return getStore(MEDIA_STORE);
}

/**
 * Conservative content-type detection from the file extension. The
 * uploader can override this via metadata, but for the imported
 * Twitter media (.jpg / .mp4 / .gif / .png / .webp) the extension is
 * authoritative and there's no need for magic-byte sniffing.
 */
export function contentTypeFromKey(key: string): string {
  const ext = key.toLowerCase().split(".").pop();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    default:
      return "application/octet-stream";
  }
}

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
