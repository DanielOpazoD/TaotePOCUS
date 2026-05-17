// Tests for `lib/media-cache.ts`. The module is small but the
// contract it enforces is load-bearing for the no-spinner-on-remount
// optimization in `<CineLoop>`. If any of these flip, a category-
// switch in the Atlas starts showing the loading skeleton again on
// already-loaded thumbnails.

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearMediaCacheForTests,
  getMediaCacheEntry,
  markMediaLoaded,
  mediaCacheSize,
} from "@/lib/media-cache";

beforeEach(() => {
  clearMediaCacheForTests();
});

describe("media-cache", () => {
  it("returns undefined for an unknown src", () => {
    expect(getMediaCacheEntry("https://example.com/a.jpg")).toBeUndefined();
  });

  it("marks a src as loaded and returns the entry", () => {
    markMediaLoaded("https://example.com/a.jpg");
    expect(getMediaCacheEntry("https://example.com/a.jpg")).toEqual({
      loaded: true,
      nativeAspect: null,
    });
  });

  it("stores the native aspect alongside the loaded flag", () => {
    markMediaLoaded("https://example.com/a.jpg", "16 / 9");
    const entry = getMediaCacheEntry("https://example.com/a.jpg");
    expect(entry?.nativeAspect).toBe("16 / 9");
  });

  it("preserves a previously-known aspect when a later call omits it", () => {
    // The image branch in CineLoop only learns the aspect on the
    // first `onLoad`. If a remount fires `onLoad` again with no
    // aspect (e.g., the consumer didn't opt into `preserveNativeAspect`),
    // we don't want the stored aspect to be wiped to null — the
    // wrapper would then briefly relayout from the cached aspect
    // back to the caller fallback.
    markMediaLoaded("https://example.com/a.jpg", "1 / 1");
    markMediaLoaded("https://example.com/a.jpg", null);
    expect(getMediaCacheEntry("https://example.com/a.jpg")?.nativeAspect).toBe("1 / 1");
  });

  it("upgrades the aspect when a later call provides one", () => {
    // Symmetric to the above: if the first call doesn't have an
    // aspect but a later one does, we want to record it.
    markMediaLoaded("https://example.com/a.jpg");
    markMediaLoaded("https://example.com/a.jpg", "4 / 3");
    expect(getMediaCacheEntry("https://example.com/a.jpg")?.nativeAspect).toBe("4 / 3");
  });

  it("is idempotent — repeated calls don't grow the cache", () => {
    markMediaLoaded("https://example.com/a.jpg");
    markMediaLoaded("https://example.com/a.jpg");
    markMediaLoaded("https://example.com/a.jpg");
    expect(mediaCacheSize()).toBe(1);
  });

  it("ignores empty / falsy src on both read and write", () => {
    // Defensive against `media.src === ""` edge cases. The cache
    // should never key on empty strings — otherwise we'd accumulate
    // a single garbage entry shared across all empty-src callers.
    markMediaLoaded("");
    expect(mediaCacheSize()).toBe(0);
    expect(getMediaCacheEntry("")).toBeUndefined();
  });

  it("keeps entries per-URL independent", () => {
    markMediaLoaded("https://example.com/a.jpg", "16 / 9");
    markMediaLoaded("https://example.com/b.jpg", "4 / 3");
    expect(getMediaCacheEntry("https://example.com/a.jpg")?.nativeAspect).toBe("16 / 9");
    expect(getMediaCacheEntry("https://example.com/b.jpg")?.nativeAspect).toBe("4 / 3");
    expect(mediaCacheSize()).toBe(2);
  });

  it("clearMediaCacheForTests wipes everything", () => {
    markMediaLoaded("https://example.com/a.jpg");
    markMediaLoaded("https://example.com/b.jpg");
    expect(mediaCacheSize()).toBe(2);
    clearMediaCacheForTests();
    expect(mediaCacheSize()).toBe(0);
    expect(getMediaCacheEntry("https://example.com/a.jpg")).toBeUndefined();
  });
});
