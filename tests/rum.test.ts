// Tests for `lib/rum.ts` exported helpers (the small pure ones).
// We don't test the full `initRum()` path because that subscribes
// to web-vitals event listeners which jsdom doesn't simulate. The
// helpers under test (`normalizeRoute`, `viewportBucket`,
// `roundValue`, `doNotTrackEnabled`) are pure / DOM-free except
// for viewport bucket — that one stubs `window.innerWidth`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __test } from "@/lib/rum";

const { normalizeRoute, viewportBucket, roundValue, doNotTrackEnabled, captureLcpElement } = __test;

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

describe("captureLcpElement", () => {
  // Builds a metric-shaped object pointing at a real DOM element so
  // captureLcpElement can fingerprint it. Cast tolerated because
  // the web-vitals types are runtime-uninspected by the helper.
  const fakeMetric = (element: Element | null): Parameters<typeof captureLcpElement>[0] => ({
    name: "LCP" as const,
    value: 2000,
    delta: 2000,
    entries: element ? [{ element } as unknown as LargestContentfulPaint] : [],
    id: "test-id",
    rating: "needs-improvement" as const,
    navigationType: "navigate" as const,
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns undefined when entries is empty", () => {
    expect(captureLcpElement(fakeMetric(null))).toBeUndefined();
  });

  it("captures tag + class + src for an IMG LCP candidate", () => {
    const img = document.createElement("img");
    img.className = "cine-video";
    // jsdom does NOT load images; setting `.src` is enough for the
    // currentSrc / src capture path.
    img.src = "http://localhost/api/media/abc123.jpg?cache=v2";
    document.body.appendChild(img);
    const el = captureLcpElement(fakeMetric(img));
    expect(el).toBeDefined();
    expect(el!.tag).toBe("IMG");
    expect(el!.cls).toBe("cine-video");
    // Query string is stripped — the capture only keeps the pathname.
    expect(el!.src).toBe("/api/media/abc123.jpg");
  });

  it("captures tag + truncated text for a heading LCP candidate", () => {
    const h1 = document.createElement("h1");
    h1.className = "section-hero-title";
    h1.textContent = "Atlas POCUS — la mejor guía clínica que hayas visto";
    document.body.appendChild(h1);
    const el = captureLcpElement(fakeMetric(h1));
    expect(el).toBeDefined();
    expect(el!.tag).toBe("H1");
    expect(el!.cls).toBe("section-hero-title");
    // Truncated to 40 chars.
    expect(el!.txt).toBeDefined();
    expect(el!.txt!.length).toBeLessThanOrEqual(40);
    expect(el!.txt).toMatch(/^Atlas POCUS/);
    // Text branch does NOT populate `src`.
    expect(el!.src).toBeUndefined();
  });

  it("never captures both `src` and `txt` for a single element", () => {
    const img = document.createElement("img");
    img.src = "http://localhost/foo.png";
    img.textContent = "alt text shouldn't leak as txt";
    document.body.appendChild(img);
    const el = captureLcpElement(fakeMetric(img));
    expect(el!.src).toBe("/foo.png");
    expect(el!.txt).toBeUndefined();
  });

  it("lowercases the class hint + truncates to 30 chars", () => {
    const div = document.createElement("div");
    div.className = "ThisIsAReallyLongClassNameThatExceedsTheThirtyCharCap extra";
    div.textContent = "x";
    document.body.appendChild(div);
    const el = captureLcpElement(fakeMetric(div));
    // classList[0] is the FIRST class; we lowercase + slice 30.
    expect(el!.cls!.length).toBeLessThanOrEqual(30);
    expect(el!.cls!).toBe(el!.cls!.toLowerCase());
  });
});
