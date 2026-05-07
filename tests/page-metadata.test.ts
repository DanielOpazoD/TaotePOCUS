// Coverage for `lib/page-metadata.ts` — the centralised SEO/OpenGraph
// builder. Every page route depends on it; a regression here drifts
// every canonical and OG card.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_SITE_URL = "https://taote.test";
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("pageMetadata", () => {
  it("uses SITE_URL alone as the canonical for the root path", async () => {
    const { pageMetadata } = await import("@/lib/page-metadata");
    const meta = pageMetadata({ title: "Home", description: "All cases", path: "/" });
    expect(meta.openGraph?.url).toBe("https://taote.test");
    expect(meta.alternates?.canonical).toBe("/");
  });

  it("appends path to SITE_URL for non-root canonicals", async () => {
    const { pageMetadata } = await import("@/lib/page-metadata");
    const meta = pageMetadata({ title: "ECG", description: "ECG content", path: "/ecg" });
    expect(meta.openGraph?.url).toBe("https://taote.test/ecg");
    expect(meta.alternates?.canonical).toBe("/ecg");
  });

  it("composes the OG and Twitter titles with the brand suffix", async () => {
    const { pageMetadata } = await import("@/lib/page-metadata");
    const meta = pageMetadata({ title: "ECG", description: "x", path: "/ecg" });
    expect(meta.openGraph?.title).toBe("ECG · Taote POCUS");
    expect(meta.twitter?.title).toBe("ECG · Taote POCUS");
  });

  it("forwards title and description verbatim at the top level", async () => {
    const { pageMetadata } = await import("@/lib/page-metadata");
    const meta = pageMetadata({
      title: "Casos clínicos",
      description: "Historias completas con razonamiento.",
      path: "/cases",
    });
    expect(meta.title).toBe("Casos clínicos");
    expect(meta.description).toBe("Historias completas con razonamiento.");
  });

  it("sets es_CL locale and summary_large_image card", async () => {
    const { pageMetadata } = await import("@/lib/page-metadata");
    const meta = pageMetadata({ title: "x", description: "x", path: "/" });
    expect(meta.openGraph?.locale).toBe("es_CL");
    // The Twitter union narrows to the specific card variant; cast to
    // the runtime shape so the test pins the literal value without
    // fighting Next.js's metadata typing.
    expect((meta.twitter as { card?: string } | undefined)?.card).toBe("summary_large_image");
  });

  it("emits robots noindex/nofollow when noindex=true (admin-style routes)", async () => {
    const { pageMetadata } = await import("@/lib/page-metadata");
    const meta = pageMetadata({
      title: "Admin",
      description: "Internal",
      path: "/admin",
      noindex: true,
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("omits robots when noindex is unset (default indexable)", async () => {
    const { pageMetadata } = await import("@/lib/page-metadata");
    const meta = pageMetadata({ title: "x", description: "x", path: "/" });
    expect(meta.robots).toBeUndefined();
  });
});
