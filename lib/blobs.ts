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
 * Store for Real-User-Monitoring web-vitals events. One blob per
 * event, keyed `events/<YYYY-MM-DD>/<eventId>` so the admin dashboard
 * can list a day's prefix and aggregate without scanning the entire
 * store. See `app/api/metrics/report/route.ts` for the write path
 * and `app/api/admin/metrics/route.ts` for the read + aggregate.
 *
 * Why a separate store from `imports`: different access pattern (lots
 * of small writes vs. fewer larger reads), different lifecycle (events
 * can be aged out / purged independently), and a separate Blobs
 * namespace makes the admin's "purge metrics" affordance scoped.
 */
export const METRICS_STORE = "web-vitals";

export function metricsStore() {
  return getStore(METRICS_STORE);
}

/**
 * Image extensions the optimization pipeline knows how to re-encode
 * into AVIF + WebP variants. Anything outside this set (videos, GIFs)
 * is served as-is from the original key — the negotiation in
 * `pickMediaCandidates` short-circuits to the single-key path.
 */
const OPTIMIZABLE_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png"]);

/**
 * Video extensions that may have a server-generated poster JPG sibling
 * (`<base>.poster.jpg`) in the blob store. See ADR-0012. When a
 * request for one of these arrives with an image-y `Accept` header
 * (i.e. the browser is fetching this URL as a `<video poster>` /
 * `<img src>` rather than as the actual video source), the candidate
 * list prepends the poster JPG so the server-pre-generated frame
 * wins. A missing poster returns to the original video stream — the
 * `<video>` element ignores video MIME on its `poster` attribute and
 * falls back to native behaviour, which matches the pre-PR state.
 */
const POSTERABLE_VIDEO_EXTS = new Set([".mp4", ".webm", ".mov"]);

/**
 * Pick which blob keys to probe (in order) when serving a media
 * request, based on what formats the client says it accepts.
 *
 * The optimization script (`scripts/optimize-media.mjs`) generates
 * `<id>.avif` and `<id>.webp` siblings next to each importable
 * `<id>.jpg|jpeg|png` in the blob store. At request time this helper
 * returns the candidate list "best first":
 *   - `image/avif` advertised → `<id>.avif` first
 *   - `image/webp` advertised → `<id>.webp` next
 *   - original (`<id>.jpg`) as the universal fallback
 *
 * The route then walks the list and serves the first one that exists.
 * If the script hasn't run yet (or a particular case has no AVIF
 * variant for any reason), the fallback still produces a valid
 * response — the negotiation is purely additive.
 *
 * Non-image keys (videos, GIFs) are returned as a single-entry list:
 *   - Videos don't have an AVIF equivalent the browser would accept
 *     anyway.
 *   - GIFs ship raw because Twitter exports them with frame data we
 *     don't want to re-encode (the import comment in `CineLoop.tsx`
 *     covers why we set `unoptimized` on the Image component too).
 *
 * @param id - The blob key as it arrives in the URL (e.g.
 *   `"1234567890.jpg"`). Includes the extension.
 * @param accept - Raw value of the request's `Accept` header, or
 *   null if absent. The check is a simple `includes` — robust enough
 *   for the standard `image/avif,image/webp,image/png,image/*` shape
 *   every modern browser sends.
 * @returns Ordered list of blob keys to try. Always at least
 *   1 entry (the original).
 */
export function pickMediaCandidates(id: string, accept: string | null): string[] {
  const lower = id.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  const acceptStr = accept ?? "";
  // EXPLICIT image preference — must contain `image/` somewhere in
  // the Accept header. Critical that we do NOT match `*/*` alone:
  // when a `<video src="…">` element fetches its source the browser
  // sends `Accept: */*`, and prepending an `.poster.jpg` candidate
  // for that request would serve a JPEG to the video element, which
  // can't play it. Image-y Accept means "I want a picture" (poster,
  // <img>) → poster wins; ambiguous Accept stays on the original
  // candidate path.
  const acceptsImageExplicitly = acceptStr.includes("image/");

  // Video keys with an image-accepting client: prepend the server-
  // generated poster JPG sibling (see ADR-0012). When the poster
  // hasn't been generated yet the fallback IS the original video
  // — `<video poster="…">` ignores non-image MIME and the browser
  // falls back to native first-frame behaviour, matching the
  // pre-PR state. Cheap, additive, zero-risk on the negative path.
  if (POSTERABLE_VIDEO_EXTS.has(ext) && acceptsImageExplicitly) {
    const base = id.slice(0, dot);
    return [`${base}.poster.jpg`, id];
  }

  if (!OPTIMIZABLE_IMAGE_EXTS.has(ext)) return [id];

  const base = id.slice(0, dot);
  const candidates: string[] = [];
  if (acceptStr.includes("image/avif")) candidates.push(`${base}.avif`);
  if (acceptStr.includes("image/webp")) candidates.push(`${base}.webp`);
  candidates.push(id);
  return candidates;
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
    case "avif":
      return "image/avif";
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

// Pure URL helpers (`mediaUrl`, `mediaKeyFromSrc`) live in
// `lib/media-url.ts` so client components can import them without
// pulling the `@netlify/blobs` runtime into the browser bundle.
export { mediaUrl, mediaKeyFromSrc } from "./media-url";
