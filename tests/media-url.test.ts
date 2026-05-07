// Pure-function coverage for `lib/media-url.ts`. Module is two helpers
// that round-trip a media key through the `/api/media/<key>` URL space;
// it ships in both the client and server bundles, so a bug here breaks
// every `<CaseRecord>.media.src` consumer simultaneously.

import { describe, expect, it } from "vitest";
import { mediaKeyFromSrc, mediaUrl } from "@/lib/media-url";

describe("mediaUrl", () => {
  it("constructs the canonical /api/media/<key> path", () => {
    expect(mediaUrl("tw-1.mp4")).toBe("/api/media/tw-1.mp4");
  });

  it("encodes special characters in the key", () => {
    expect(mediaUrl("tw 1?2#3")).toBe("/api/media/tw%201%3F2%233");
  });
});

describe("mediaKeyFromSrc", () => {
  it("returns null for null/undefined/empty", () => {
    expect(mediaKeyFromSrc(null)).toBeNull();
    expect(mediaKeyFromSrc(undefined)).toBeNull();
    expect(mediaKeyFromSrc("")).toBeNull();
  });

  it("returns null for non-media URLs", () => {
    expect(mediaKeyFromSrc("https://cdn.example.com/foo.png")).toBeNull();
    expect(mediaKeyFromSrc("data:image/png;base64,abcd")).toBeNull();
    expect(mediaKeyFromSrc("/some/other/path")).toBeNull();
  });

  it("extracts the key from /api/media/<key>", () => {
    expect(mediaKeyFromSrc("/api/media/tw-1.mp4")).toBe("tw-1.mp4");
  });

  it("extracts the key from the legacy /imports/<key> path", () => {
    expect(mediaKeyFromSrc("/imports/tw-1.mp4")).toBe("tw-1.mp4");
  });

  it("strips query string and fragment from the key", () => {
    expect(mediaKeyFromSrc("/api/media/tw-1.mp4?v=2#frag")).toBe("tw-1.mp4");
    expect(mediaKeyFromSrc("/imports/tw-1.mp4?v=2")).toBe("tw-1.mp4");
  });

  it("decodes percent-escapes in the key", () => {
    expect(mediaKeyFromSrc("/api/media/tw%201.mp4")).toBe("tw 1.mp4");
  });

  it("falls back to the raw segment when decoding throws (malformed escape)", () => {
    // `%E0%A4%A` is a truncated UTF-8 sequence — decodeURIComponent throws.
    expect(mediaKeyFromSrc("/api/media/%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("round-trips with mediaUrl", () => {
    const key = "tw-1384957343272689668.mp4";
    expect(mediaKeyFromSrc(mediaUrl(key))).toBe(key);
  });
});
