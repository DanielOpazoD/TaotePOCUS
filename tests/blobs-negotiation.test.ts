// Tests for `pickMediaCandidates` — the content-negotiation helper
// that turns an incoming `/api/media/<id>` request into an ordered
// list of blob keys to probe. The route walks the list and serves
// the first variant that exists; the optimization script
// (`scripts/optimize-media.mjs`) is what produces the variants.
//
// The order matters: we want the BEST format the client supports
// first, so the variant the optimizer generated (AVIF) gets served
// over the heavier original. Negotiation is purely additive — if
// the variant hasn't been generated, the fallback to the original
// still produces a valid response.

import { describe, expect, it } from "vitest";
import { pickMediaCandidates } from "@/lib/blobs";

describe("pickMediaCandidates", () => {
  it("returns avif → webp → original when both modern formats are accepted", () => {
    // The canonical Chrome / modern Firefox Accept header for img.
    const accept = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
    expect(pickMediaCandidates("1234.jpg", accept)).toEqual(["1234.avif", "1234.webp", "1234.jpg"]);
  });

  it("returns webp → original when only webp is accepted (older Safari)", () => {
    const accept = "image/webp,image/apng,image/*,*/*;q=0.8";
    expect(pickMediaCandidates("1234.jpg", accept)).toEqual(["1234.webp", "1234.jpg"]);
  });

  it("returns avif → original when only avif is accepted (rare client)", () => {
    expect(pickMediaCandidates("1234.png", "image/avif,*/*")).toEqual(["1234.avif", "1234.png"]);
  });

  it("returns just the original when no modern format is advertised", () => {
    // Old Safari / curl / generic `*/*` clients land here.
    expect(pickMediaCandidates("1234.jpg", "*/*")).toEqual(["1234.jpg"]);
  });

  it("returns just the original when Accept is null (no header)", () => {
    expect(pickMediaCandidates("1234.jpg", null)).toEqual(["1234.jpg"]);
  });

  it("normalizes the extension match case-insensitively", () => {
    // Twitter exports sometimes ship uppercase extensions.
    expect(pickMediaCandidates("1234.JPG", "image/avif,*/*")).toEqual(["1234.avif", "1234.JPG"]);
  });

  it("handles `.jpeg` (long form) the same as `.jpg`", () => {
    expect(pickMediaCandidates("1234.jpeg", "image/webp,*/*")).toEqual(["1234.webp", "1234.jpeg"]);
  });

  it("preserves the base id when stripping the extension", () => {
    // The base might include dashes, underscores, and digits — the
    // function should only strip the LAST dot-separated segment.
    expect(pickMediaCandidates("tw-1556671471358840832.jpg", "image/avif,*/*")).toEqual([
      "tw-1556671471358840832.avif",
      "tw-1556671471358840832.jpg",
    ]);
  });

  it("returns single-entry list for videos (no variant pipeline)", () => {
    // MP4 / WebM / MOV don't go through the AVIF/WebP encoder; the
    // negotiation short-circuits to a single key.
    expect(pickMediaCandidates("1234.mp4", "video/webm,video/mp4,*/*")).toEqual(["1234.mp4"]);
    expect(pickMediaCandidates("1234.webm", "*/*")).toEqual(["1234.webm"]);
  });

  // ─── ADR-0012: server-side video posters ────────────────────────
  // A video URL fetched as `<video poster>` / `<img src>` sends
  // `Accept: image/...` and gets the poster JPG sibling first; same
  // URL fetched as `<video src>` sends `Accept: */*` (no `image/`)
  // and keeps the original video stream. Test both shapes.

  it("prepends the poster JPG for videos when client wants an image (mp4)", () => {
    // Browser fetching `<video poster="/api/media/1234.mp4">`.
    expect(
      pickMediaCandidates("1234.mp4", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"),
    ).toEqual(["1234.poster.jpg", "1234.mp4"]);
  });

  it("prepends the poster JPG for videos when client wants an image (webm)", () => {
    expect(pickMediaCandidates("clip.webm", "image/avif,*/*")).toEqual([
      "clip.poster.jpg",
      "clip.webm",
    ]);
  });

  it("prepends the poster JPG for videos when client wants an image (mov)", () => {
    expect(pickMediaCandidates("clip.mov", "image/webp,*/*")).toEqual([
      "clip.poster.jpg",
      "clip.mov",
    ]);
  });

  it("does NOT touch video keys when Accept is just `*/*` (video src request)", () => {
    // The `<video src="…">` element sends `Accept: */*` (no
    // `image/`). Adding a poster candidate here would serve a JPEG
    // to the video element, which can't play it — regression risk.
    expect(pickMediaCandidates("1234.mp4", "*/*")).toEqual(["1234.mp4"]);
    expect(pickMediaCandidates("1234.mp4", null)).toEqual(["1234.mp4"]);
  });

  it("does NOT touch video keys when Accept is a video MIME explicitly", () => {
    // Belt-and-suspenders for clients that DO advertise video types.
    expect(pickMediaCandidates("1234.mp4", "video/mp4,video/*,*/*")).toEqual(["1234.mp4"]);
  });

  it("does NOT prepend a poster for GIFs (animated, no still poster)", () => {
    // GIFs are their own animation; they don't get a poster sibling.
    expect(pickMediaCandidates("1234.gif", "image/avif,*/*")).toEqual(["1234.gif"]);
  });

  it("returns single-entry list for GIFs (frame data, no re-encode)", () => {
    // GIFs ship raw — the import pipeline doesn't generate AVIF/WebP
    // for animated content (lossy compression would freeze the
    // animation). The route just hands them back as-is.
    expect(pickMediaCandidates("1234.gif", "image/avif,image/webp,image/*")).toEqual(["1234.gif"]);
  });

  it("returns single-entry list for keys without an extension", () => {
    // Defensive: unknown blob shapes shouldn't crash. The route
    // serves whatever the original blob is.
    expect(pickMediaCandidates("legacy-key", "image/avif,*/*")).toEqual(["legacy-key"]);
  });

  it("returns single-entry list for already-modern keys (avif/webp source)", () => {
    // If someone uploads an AVIF directly (future workflow), we
    // don't try to re-encode it — just serve it. Same for WebP.
    expect(pickMediaCandidates("1234.avif", "image/avif,*/*")).toEqual(["1234.avif"]);
    expect(pickMediaCandidates("1234.webp", "image/webp,*/*")).toEqual(["1234.webp"]);
  });
});
