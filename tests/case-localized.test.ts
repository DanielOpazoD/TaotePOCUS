// Tests for the bilingual case-content helpers introduced in
// Phase-2 i18n (Nov-2026). Pins:
//   - Legacy plain-string + plain-array inputs normalize cleanly.
//   - Modern dual-shape inputs round-trip without mutation.
//   - EN→ES fallback fires when the EN slot is missing or empty.
//   - The `isFallback` flag accurately reflects whether the
//     fallback fired (downstream UI uses it to mount the badge).
//   - Search haystack indexes both languages.

import { describe, expect, it } from "vitest";
import {
  compareTitles,
  fallbackBadgeLabel,
  getCaseDescription,
  getCaseTags,
  getCaseTitle,
  normalizeCase,
  normalizeLocalizedString,
  normalizeLocalizedTags,
  readLocalized,
  searchHaystack,
} from "@/lib/case-localized";
import type { CaseRecord, LocalizedString } from "@/lib/types";
import { caseFactory } from "./fixtures";

describe("normalizeLocalizedString", () => {
  it("wraps a plain string into the ES slot", () => {
    expect(normalizeLocalizedString("Hola")).toEqual({ es: "Hola" });
  });

  it("preserves an already-normalized object", () => {
    expect(normalizeLocalizedString({ es: "Hola", en: "Hi" })).toEqual({
      es: "Hola",
      en: "Hi",
    });
  });

  it("drops an empty EN slot (treated as 'translation pending')", () => {
    expect(normalizeLocalizedString({ es: "Hola", en: "" })).toEqual({ es: "Hola" });
  });

  it("returns an empty ES baseline for malformed input", () => {
    expect(normalizeLocalizedString(null)).toEqual({ es: "" });
    expect(normalizeLocalizedString(undefined)).toEqual({ es: "" });
    expect(normalizeLocalizedString(42)).toEqual({ es: "" });
    expect(normalizeLocalizedString({})).toEqual({ es: "" });
  });
});

describe("normalizeLocalizedTags", () => {
  it("wraps a plain string array into the ES slot", () => {
    expect(normalizeLocalizedTags(["a", "b"])).toEqual({ es: ["a", "b"] });
  });

  it("filters non-string entries from a plain array", () => {
    expect(normalizeLocalizedTags(["a", 42, null, "b"])).toEqual({ es: ["a", "b"] });
  });

  it("preserves a normalized object", () => {
    expect(normalizeLocalizedTags({ es: ["x"], en: ["y"] })).toEqual({
      es: ["x"],
      en: ["y"],
    });
  });

  it("drops an empty EN list (treated as 'translation pending')", () => {
    expect(normalizeLocalizedTags({ es: ["x"], en: [] })).toEqual({ es: ["x"] });
  });

  it("returns an empty ES baseline for non-array / malformed input", () => {
    expect(normalizeLocalizedTags(null)).toEqual({ es: [] });
    expect(normalizeLocalizedTags("nope")).toEqual({ es: [] });
    expect(normalizeLocalizedTags({})).toEqual({ es: [] });
  });
});

describe("normalizeCase", () => {
  it("is idempotent on already-normalized cases", () => {
    const c = caseFactory({
      title: { es: "T", en: "T-en" },
      description: { es: "D", en: "D-en" },
      tags: { es: ["a"], en: ["A"] },
    });
    const out = normalizeCase(c);
    expect(out.title).toEqual({ es: "T", en: "T-en" });
    expect(out.description).toEqual({ es: "D", en: "D-en" });
    expect(out.tags).toEqual({ es: ["a"], en: ["A"] });
  });

  it("doesn't mutate the input", () => {
    const c = caseFactory({ title: { es: "T" } });
    const before = c.title;
    normalizeCase(c);
    expect(c.title).toBe(before);
  });
});

describe("readLocalized — fallback semantics", () => {
  const value: LocalizedString = { es: "Hola" };
  const both: LocalizedString = { es: "Hola", en: "Hello" };

  it("returns the requested slot when present", () => {
    expect(readLocalized(both, "es")).toEqual({
      value: "Hola",
      isFallback: false,
      source: "es",
    });
    expect(readLocalized(both, "en")).toEqual({
      value: "Hello",
      isFallback: false,
      source: "en",
    });
  });

  it("falls back from EN to ES when the EN slot is missing", () => {
    expect(readLocalized(value, "en")).toEqual({
      value: "Hola",
      isFallback: true,
      source: "es",
    });
  });

  it("falls back from EN to ES when the EN slot is empty", () => {
    expect(readLocalized({ es: "Hola", en: "" }, "en")).toEqual({
      value: "Hola",
      isFallback: true,
      source: "es",
    });
  });

  it("ES never falls back (it's the baseline)", () => {
    expect(readLocalized(value, "es").isFallback).toBe(false);
  });
});

describe("getCaseTitle / getCaseDescription / getCaseTags", () => {
  const c: CaseRecord = caseFactory({
    title: { es: "Edema", en: "Edema EN" },
    description: { es: "Resumen" },
    tags: { es: ["B-líneas"], en: ["B-lines"] },
  });

  it("title resolves with fallback metadata", () => {
    expect(getCaseTitle(c, "en").value).toBe("Edema EN");
    expect(getCaseTitle(c, "en").isFallback).toBe(false);
  });

  it("description falls back when EN is missing", () => {
    const read = getCaseDescription(c, "en");
    expect(read.value).toBe("Resumen");
    expect(read.isFallback).toBe(true);
    expect(read.source).toBe("es");
  });

  it("tags resolve to the language list when present", () => {
    expect(getCaseTags(c, "en").tags).toEqual(["B-lines"]);
    expect(getCaseTags(c, "en").isFallback).toBe(false);
  });

  it("tags fall back to ES when EN list is empty / missing", () => {
    const c2 = caseFactory({ tags: { es: ["only-es"] } });
    expect(getCaseTags(c2, "en")).toEqual({
      tags: ["only-es"],
      isFallback: true,
      source: "es",
    });
  });
});

describe("searchHaystack", () => {
  it("indexes both languages so cross-language search hits", () => {
    const c = caseFactory({
      title: { es: "Edema agudo", en: "Acute edema" },
      description: { es: "Líneas B confluentes", en: "Confluent B-lines" },
      tags: { es: ["B-líneas"], en: ["B-lines"] },
    });
    const hay = searchHaystack(c);
    // Searching the EN string still hits the ES content via the
    // joined haystack.
    expect(hay).toContain("acute edema");
    expect(hay).toContain("edema agudo");
    expect(hay).toContain("b-lines");
    expect(hay).toContain("b-líneas");
  });
});

describe("compareTitles", () => {
  it("orders by the active-language slot (with fallback)", () => {
    const a = caseFactory({ title: { es: "Aorta", en: "Aorta" } });
    const b = caseFactory({ title: { es: "Bazo", en: "Spleen" } });
    expect(compareTitles(a, b, "es")).toBeLessThan(0);
    // In EN, "Aorta" still comes before "Spleen".
    expect(compareTitles(a, b, "en")).toBeLessThan(0);
  });
});

describe("fallbackBadgeLabel", () => {
  it("surfaces the source language as an uppercase badge", () => {
    const read = { value: "Hola", isFallback: true, source: "es" } as const;
    expect(fallbackBadgeLabel(read)).toBe("ES");
  });
});
