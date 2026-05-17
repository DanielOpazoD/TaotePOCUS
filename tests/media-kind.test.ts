// Tests for `lib/media-kind.ts > isMediaVideo`. The helper sits
// between the imported corpus (where `media.kind` is unreliable for
// 218/326 cases — Twitter "animated_gif" entries declare `kind:
// "gif"` but ship an `.mp4` file) and the various renderers that
// need to pick between `<video>` and `<img>` / `<Image>`. Every
// surface that consumes user-provided Media should agree on the
// dispatch; this test pins the rules.

import { describe, expect, it } from "vitest";

import { isMediaVideo } from "@/lib/media-kind";
import type { Media } from "@/lib/types";

function media(overrides: Partial<Media>): Media {
  return { kind: "image", src: "", ...overrides };
}

describe("isMediaVideo", () => {
  describe("nullish input", () => {
    it("returns false for undefined", () => {
      expect(isMediaVideo(undefined)).toBe(false);
    });
    it("returns false for null", () => {
      expect(isMediaVideo(null)).toBe(false);
    });
  });

  describe("dispatch by kind", () => {
    it("returns true when kind === 'video' regardless of extension", () => {
      // The kind-takes-precedence case: an admin uploaded a file
      // labeled as video, even if the extension is weird (could be
      // a CDN URL without an extension).
      expect(isMediaVideo(media({ kind: "video", src: "https://cdn.example.com/clip" }))).toBe(
        true,
      );
      expect(isMediaVideo(media({ kind: "video", src: "https://cdn.example.com/x.jpg" }))).toBe(
        true,
      );
    });

    it("returns false for kind === 'image' + a real image extension", () => {
      expect(isMediaVideo(media({ kind: "image", src: "https://cdn.example.com/x.jpg" }))).toBe(
        false,
      );
      expect(isMediaVideo(media({ kind: "image", src: "https://cdn.example.com/x.png" }))).toBe(
        false,
      );
    });

    it("returns false for kind === 'gif' + a `.gif` extension", () => {
      expect(isMediaVideo(media({ kind: "gif", src: "https://cdn.example.com/x.gif" }))).toBe(
        false,
      );
    });
  });

  describe("the corpus mismatch — kind:'gif' + `.mp4` extension", () => {
    it("returns true for kind === 'gif' + `.mp4` (Twitter animated_gif case)", () => {
      // This is the bug class that prompted the helper: the imported
      // corpus has 218 cases shaped like this. Without the extension
      // check, every renderer downstream rendered them as `<img>`
      // and the cell painted blank.
      expect(
        isMediaVideo(
          media({
            kind: "gif",
            src: "/imports/1252063545010905094.mp4",
          }),
        ),
      ).toBe(true);
    });

    it("returns true for kind === 'image' + `.mp4`", () => {
      // Smaller cohort in the corpus (~32 cases) but same trap.
      expect(isMediaVideo(media({ kind: "image", src: "x.mp4" }))).toBe(true);
    });
  });

  describe("video extensions other than .mp4", () => {
    it("recognizes .webm", () => {
      expect(isMediaVideo(media({ kind: "image", src: "clip.webm" }))).toBe(true);
    });
    it("recognizes .mov (QuickTime)", () => {
      expect(isMediaVideo(media({ kind: "image", src: "clip.mov" }))).toBe(true);
    });
    it("recognizes .m4v", () => {
      expect(isMediaVideo(media({ kind: "image", src: "clip.m4v" }))).toBe(true);
    });
    it("is case-insensitive on the extension", () => {
      expect(isMediaVideo(media({ kind: "image", src: "clip.MP4" }))).toBe(true);
      expect(isMediaVideo(media({ kind: "image", src: "clip.WebM" }))).toBe(true);
    });
  });

  describe("URLs with query strings", () => {
    it("recognizes .mp4 followed by `?` query (cache-busting / CDN params)", () => {
      // The regex anchors on `(?|$)` so trailing query strings don't
      // break detection. Important for CDN URLs that get versioning.
      expect(isMediaVideo(media({ kind: "image", src: "clip.mp4?v=123" }))).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("returns false on empty src + non-video kind", () => {
      expect(isMediaVideo(media({ kind: "image", src: "" }))).toBe(false);
      expect(isMediaVideo(media({ kind: "gif", src: "" }))).toBe(false);
    });

    it("returns true on empty src + kind === 'video' (kind wins)", () => {
      // Defensive: if a future surface synthesizes a Media without a
      // src but with kind: "video", we still pick the video renderer.
      expect(isMediaVideo(media({ kind: "video", src: "" }))).toBe(true);
    });

    it("returns false for partial extension matches (no false positives on filenames)", () => {
      // The regex anchors the dot — `image-mp4-vs-jpg.png` should
      // NOT match. Important so a filename with "mp4" inside doesn't
      // trigger video rendering.
      expect(isMediaVideo(media({ kind: "image", src: "image-mp4-vs-jpg.png" }))).toBe(false);
    });

    it("returns false for unknown extensions", () => {
      // .avi / .mkv / .ts are video but not in the renderer's list
      // (they don't reliably play in browser <video> tags). Treated
      // as non-video so they fall through to <img> + error UI.
      expect(isMediaVideo(media({ kind: "image", src: "clip.avi" }))).toBe(false);
      expect(isMediaVideo(media({ kind: "image", src: "clip.mkv" }))).toBe(false);
    });
  });
});
