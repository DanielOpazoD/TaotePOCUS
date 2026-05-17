// Helper for "does this Media render as a `<video>` or as an
// `<img>` / `<Image>`?".
//
// **Why this exists**: the imported corpus marks 218 cases with
// `media.kind === "gif"` whose actual file is `.mp4` (Twitter
// animated GIFs ship as mp4). A handful more have `kind === "image"`
// + an `.mp4` source. Renderers that dispatch on `kind` alone (i.e.
// `kind === "video" ? <video/> : <img/>`) feed an `.mp4` URL into
// an `<img>` tag — browsers paint nothing, the cell looks blank.
//
// Audit on the seed corpus (May-2026):
//
//   By kind:        { image: 76,  gif: 218, video: 32 }
//   By extension:   { jpg: 76,    mp4: 250 }
//
// → 218 cases are `kind:"gif"` + `.mp4` extension. Without the
// extension-based fallback below, every renderer that touches one
// of those cases breaks.
//
// **Contract**: `isMediaVideo(m)` returns true iff `m` should render
// inside a `<video>` element. Decision order:
//
//   1. `kind === "video"` → always video.
//   2. URL extension matches known video formats → video.
//   3. Otherwise → image (including `kind === "gif"` with a `.gif`
//      source, which `<img>` handles natively).
//
// The extension list mirrors the regex used by the service worker
// runtime cache (`app/sw.ts`) so both surfaces agree on what's a
// video — diverging would mean the SW caches a file the renderer
// can't read, or vice versa.

import type { Media } from "./types";

/** File extensions the app renders inside `<video>` rather than
 *  `<img>` / `<Image>`. Kept in sync with `app/sw.ts`. */
const VIDEO_EXTENSION_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;

/**
 * Should this media render as `<video>`?
 *
 * Returns `false` for null/undefined input so callers can use it as
 * a primary branching expression without a separate null check.
 */
export function isMediaVideo(media: Media | undefined | null): boolean {
  if (!media) return false;
  if (media.kind === "video") return true;
  if (!media.src) return false;
  return VIDEO_EXTENSION_RE.test(media.src);
}
