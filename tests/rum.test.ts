// Tests for `lib/rum.ts` exported helpers (the small pure ones).
// We don't test the full `initRum()` path because that subscribes
// to web-vitals event listeners which jsdom doesn't simulate. The
// helpers under test (`normalizeRoute`, `viewportBucket`,
// `roundValue`, `doNotTrackEnabled`) are pure / DOM-free except
// for viewport bucket — that one stubs `window.innerWidth`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __test } from "@/lib/rum";

const { normalizeRoute, viewportBucket, roundValue, doNotTrackEnabled } = __test;

describe("normalizeRoute", () => {
  it("returns / for the root path", () => {
    expect(normalizeRoute("/")).toBe("/");
  });

  it("collapses every /admin sub-route to /admin", () => {
    expect(normalizeRoute("/admin")).toBe("/admin");
    expect(normalizeRoute("/admin/backup")).toBe("/admin");
    expect(normalizeRoute("/admin/metrics")).toBe("/admin");
  });

  it("trims a trailing slash from non-root paths", () => {
    expect(normalizeRoute("/atlas/")).toBe("/atlas");
  });

  it("passes through ordinary section paths unchanged", () => {
    expect(normalizeRoute("/ecg")).toBe("/ecg");
    expect(normalizeRoute("/cases")).toBe("/cases");
    expect(normalizeRoute("/favoritos")).toBe("/favoritos");
  });
});

describe("roundValue", () => {
  it("rounds time-based metrics to integer milliseconds", () => {
    expect(roundValue("lcp", 1234.7)).toBe(1235);
    expect(roundValue("inp", 89.4)).toBe(89);
    expect(roundValue("fcp", 600.5)).toBe(601);
    expect(roundValue("ttfb", 90.1)).toBe(90);
  });

  it("rounds CLS to 4 decimal places", () => {
    expect(roundValue("cls", 0.12345)).toBeCloseTo(0.1235, 4);
    expect(roundValue("cls", 0.00009)).toBeCloseTo(0.0001, 4);
    expect(roundValue("cls", 0.5)).toBeCloseTo(0.5, 4);
  });
});

describe("viewportBucket", () => {
  const origInner = global.innerWidth;
  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: origInner,
    });
  });

  it("returns 'mobile' under 640px", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    expect(viewportBucket()).toBe("mobile");
  });

  it("returns 'tablet' between 640 and 959px", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 768 });
    expect(viewportBucket()).toBe("tablet");
  });

  it("returns 'desktop' at 960px or above", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    expect(viewportBucket()).toBe("desktop");
  });
});

describe("doNotTrackEnabled", () => {
  beforeEach(() => {
    // Reset between tests. Setting to undefined rather than
    // `delete` because the native `Navigator.doNotTrack` is a
    // declared property (not optional) and `delete` is rejected
    // by strict TS — `undefined` is the closest functional reset.
    Object.defineProperty(navigator, "doNotTrack", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    (window as Window & { doNotTrack?: string }).doNotTrack = undefined;
  });

  it("returns false when DNT is unset", () => {
    expect(doNotTrackEnabled()).toBe(false);
  });

  it("returns true when navigator.doNotTrack === '1'", () => {
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "1" });
    expect(doNotTrackEnabled()).toBe(true);
  });

  it("returns true when window.doNotTrack === '1' (older IE/Edge)", () => {
    (window as Window & { doNotTrack?: string }).doNotTrack = "1";
    expect(doNotTrackEnabled()).toBe(true);
  });

  it("returns false for '0' or unknown values", () => {
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "0" });
    expect(doNotTrackEnabled()).toBe(false);
  });
});
