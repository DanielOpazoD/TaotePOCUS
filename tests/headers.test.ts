import { describe, expect, it } from "vitest";
import { derivePageHead } from "@/lib/headers";
import type { View } from "@/lib/types";

describe("derivePageHead", () => {
  const atlas: View = { kind: "section", section: "atlas" };
  const ecg: View = { kind: "section", section: "ecg" };

  it("renders the atlas section head when no category is active", () => {
    const head = derivePageHead(atlas, null);
    expect(head.title).toBe("Atlas POCUS");
    expect(head.crumb).toBe("Atlas POCUS");
    expect(head.sub).toMatch(/Imágenes/);
  });

  it("uses the category label as title when a category is active", () => {
    const head = derivePageHead(atlas, "cardiac");
    expect(head.title).toBe("Cardíaco");
    expect(head.crumb).toBe("Atlas POCUS · Categoría");
    expect(head.sub).toBe("Atlas POCUS · Cardíaco");
  });

  it("renders the favs view independent of section/category", () => {
    const head = derivePageHead({ kind: "favs" }, "cardiac");
    expect(head.title).toBe("Tu colección");
    expect(head.crumb).toBe("Mi colección");
  });

  it("renders the admin view", () => {
    const head = derivePageHead({ kind: "admin" }, null);
    expect(head.title).toBe("Panel de administración");
    expect(head.crumb).toBe("Admin");
  });

  it("uses the ECG section copy", () => {
    const head = derivePageHead(ecg, null);
    expect(head.title).toBe("ECG");
    expect(head.sub).toMatch(/Electrocardiograma/);
  });

  // Section-label override branches in `readOverride` (lines 23-26 in
  // lib/headers.ts). Each test pins one cell of the resolution truth
  // table for the override input — legacy plain string, the Phase-3
  // `LocalizedString` shape, empty strings, EN→ES fallback.
  describe("section label overrides", () => {
    it("applies a legacy plain-string override over the dictionary label", () => {
      // When no category is active, the override replaces the title.
      const head = derivePageHead(atlas, null, { atlas: "Mi atlas" });
      expect(head.title).toBe("Mi atlas");
      // With a category active, the override flows into sub/crumb
      // (resolvedSectionLabel) but the title becomes the category.
      const headWithCat = derivePageHead(atlas, "cardiac", { atlas: "Mi atlas" });
      expect(headWithCat.sub).toContain("Mi atlas");
    });

    it("treats an empty-string override as no override (falls through to dictionary)", () => {
      const head = derivePageHead(atlas, "cardiac", { atlas: "" });
      // Empty override → readOverride returns null → fall through to
      // sectionLabel which yields the canonical "Atlas POCUS" label.
      expect(head.sub).toContain("Atlas POCUS");
    });

    it("uses the EN slot of a LocalizedString override when lang is en", () => {
      const head = derivePageHead(
        atlas,
        "cardiac",
        { atlas: { es: "Mi atlas", en: "My atlas" } },
        "en",
      );
      expect(head.sub).toContain("My atlas");
    });

    it("falls back to the ES slot when EN is missing", () => {
      const head = derivePageHead(atlas, "cardiac", { atlas: { es: "Mi atlas", en: "" } }, "en");
      expect(head.sub).toContain("Mi atlas");
    });

    it("uses the ES slot when lang is es and ES slot is non-empty", () => {
      const head = derivePageHead(
        atlas,
        "cardiac",
        { atlas: { es: "Mi atlas", en: "My atlas" } },
        "es",
      );
      expect(head.sub).toContain("Mi atlas");
    });

    it("returns null override (falls through) when both EN and ES slots are empty", () => {
      // Both slots empty → readOverride returns null → fall through to
      // the dictionary label in the requested language. In EN that's
      // "POCUS Atlas" (the English ordering), not "Atlas POCUS".
      const head = derivePageHead(atlas, "cardiac", { atlas: { es: "", en: "" } }, "en");
      expect(head.sub).toContain("POCUS Atlas");
    });
  });
});
