// Pure i18n module tests — no React, no DOM. Covers:
//   - Type guards and browser-language detection.
//   - Dictionary completeness across languages.
//   - Variable interpolation.
//   - Locale-aware date formatters.
//   - Section / category label resolvers (built-in + custom fallback).
//
// The chrome integration is exercised by the component tests
// (Header / Sidebar / etc.) so this file stays focused on the
// translation primitives themselves.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANG,
  DICTS,
  LANGS,
  categoryLabel,
  detectBrowserLang,
  formatDate,
  formatDateTime,
  interpolate,
  isLang,
  localeOf,
  sectionLabel,
  sectionSub,
  translate,
} from "@/lib/i18n";

describe("isLang", () => {
  it("accepts the supported language tags", () => {
    expect(isLang("es")).toBe(true);
    expect(isLang("en")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isLang("pt")).toBe(false);
    expect(isLang("EN")).toBe(false); // case-sensitive on purpose
    expect(isLang("")).toBe(false);
    expect(isLang(null)).toBe(false);
    expect(isLang(undefined)).toBe(false);
    expect(isLang(42)).toBe(false);
    expect(isLang({ lang: "es" })).toBe(false);
  });
});

describe("detectBrowserLang", () => {
  it("returns 'es' for Spanish locales (any region)", () => {
    expect(detectBrowserLang("es")).toBe("es");
    expect(detectBrowserLang("es-CL")).toBe("es");
    expect(detectBrowserLang("es-419")).toBe("es");
    expect(detectBrowserLang("ES-MX")).toBe("es"); // case-insensitive
    expect(detectBrowserLang("es_AR")).toBe("es"); // legacy underscore form
  });

  it("returns 'en' for English locales", () => {
    expect(detectBrowserLang("en")).toBe("en");
    expect(detectBrowserLang("en-US")).toBe("en");
    expect(detectBrowserLang("en-GB")).toBe("en");
    expect(detectBrowserLang("EN_AU")).toBe("en");
  });

  it("falls back to DEFAULT_LANG for unsupported and empty inputs", () => {
    expect(detectBrowserLang("pt-BR")).toBe(DEFAULT_LANG);
    expect(detectBrowserLang("fr")).toBe(DEFAULT_LANG);
    expect(detectBrowserLang("")).toBe(DEFAULT_LANG);
    expect(detectBrowserLang(null)).toBe(DEFAULT_LANG);
    expect(detectBrowserLang(undefined)).toBe(DEFAULT_LANG);
  });
});

describe("LANGS / DEFAULT_LANG", () => {
  it("DEFAULT_LANG is one of the supported tags", () => {
    expect(LANGS).toContain(DEFAULT_LANG);
  });

  it("DICTS has an entry for every supported language", () => {
    for (const lang of LANGS) {
      expect(DICTS[lang]).toBeDefined();
    }
  });
});

describe("dictionary parity", () => {
  it("every key present in ES is present in EN with a non-empty string", () => {
    const esKeys = Object.keys(DICTS.es) as (keyof typeof DICTS.es)[];
    for (const key of esKeys) {
      expect(typeof DICTS.en[key]).toBe("string");
      expect(DICTS.en[key].length).toBeGreaterThan(0);
    }
  });

  it("EN does not introduce keys missing from ES (TS already enforces this; sanity check)", () => {
    const esKeys = new Set(Object.keys(DICTS.es));
    for (const key of Object.keys(DICTS.en)) {
      expect(esKeys.has(key)).toBe(true);
    }
  });
});

describe("interpolate", () => {
  it("returns the template untouched when no vars are passed", () => {
    expect(interpolate("hello world")).toBe("hello world");
    expect(interpolate("hi {name}!")).toBe("hi {name}!");
  });

  it("substitutes named placeholders", () => {
    expect(interpolate("hi {name}!", { name: "Daniel" })).toBe("hi Daniel!");
    expect(interpolate("{n} casos", { n: 47 })).toBe("47 casos");
  });

  it("leaves unknown placeholders intact", () => {
    expect(interpolate("hi {name}, {n} cases", { n: 3 })).toBe("hi {name}, 3 cases");
  });

  it("substitutes the same placeholder multiple times", () => {
    expect(interpolate("{x}+{x}={y}", { x: 2, y: 4 })).toBe("2+2=4");
  });
});

describe("translate", () => {
  it("returns the ES string for the ES dict", () => {
    expect(translate("es", "nav.favoritos")).toBe("Favoritos");
  });

  it("returns the EN string for the EN dict", () => {
    expect(translate("en", "nav.favoritos")).toBe("Favorites");
  });

  it("interpolates {count} in templated strings", () => {
    expect(translate("es", "footer.cases", { count: 47 })).toBe("47 casos publicados");
    expect(translate("en", "footer.cases", { count: 47 })).toBe("47 published cases");
  });
});

describe("formatDate", () => {
  it("returns an em-dash for invalid input", () => {
    expect(formatDate(undefined, "es")).toBe("—");
    expect(formatDate("not-a-date", "es")).toBe("—");
  });

  it("formats a known date in es-CL", () => {
    const out = formatDate("2026-05-08T12:00:00Z", "es");
    // Locale formatting can vary slightly across runtimes; assert
    // on the parts that should always appear.
    expect(out).toMatch(/2026/);
    expect(out.toLowerCase()).toMatch(/may/);
  });

  it("formats a known date in en-US", () => {
    const out = formatDate("2026-05-08T12:00:00Z", "en");
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/May/);
  });

  it("accepts a Date instance directly", () => {
    const out = formatDate(new Date("2026-01-15T00:00:00Z"), "en");
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/Jan/);
  });
});

describe("formatDateTime", () => {
  it("returns an empty string for missing input", () => {
    expect(formatDateTime(undefined, "es")).toBe("");
  });

  it("includes both date and time components", () => {
    const out = formatDateTime("2026-05-08T14:32:00Z", "es");
    expect(out).toMatch(/2026/);
    // Hour/minute formatting differs by locale but always shows :
    expect(out).toMatch(/:/);
  });
});

describe("localeOf", () => {
  it("maps each language to a sensible Intl locale tag", () => {
    expect(localeOf("es")).toBe("es-CL");
    expect(localeOf("en")).toBe("en-US");
  });
});

describe("sectionLabel / sectionSub", () => {
  it("returns the canonical Spanish label for built-in sections", () => {
    expect(sectionLabel("atlas", "es")).toBe("Atlas POCUS");
    expect(sectionLabel("ecg", "es")).toBe("ECG");
    expect(sectionLabel("rayos", "es")).toBe("Rayos");
  });

  it("returns the English label for built-in sections", () => {
    expect(sectionLabel("atlas", "en")).toBe("POCUS Atlas");
    expect(sectionLabel("rayos", "en")).toBe("Imaging");
    expect(sectionLabel("cases", "en")).toBe("Clinical cases");
  });

  it("returns the section description (sub)", () => {
    expect(sectionSub("atlas", "es")).toMatch(/Imágenes/);
    expect(sectionSub("atlas", "en")).toMatch(/Ultrasound/);
  });

  it("falls back to the literal id for an unknown section", () => {
    expect(sectionLabel("unknown", "es")).toBe("unknown");
    expect(sectionSub("unknown", "en")).toBe("");
  });
});

describe("categoryLabel", () => {
  it("returns the localized label for a built-in category", () => {
    expect(categoryLabel({ id: "cardiac", label: "Cardíaco" }, "es")).toBe("Cardíaco");
    expect(categoryLabel({ id: "cardiac", label: "Cardíaco" }, "en")).toBe("Cardiac");
    expect(categoryLabel({ id: "ms", label: "Musculoesquelético" }, "en")).toBe("Musculoskeletal");
  });

  it("falls back to the input label for a custom category (no dict key)", () => {
    // Custom categories created by the admin use ids like `c:foo`
    // which are NOT in the dictionary. The label field is what
    // they typed at creation time.
    expect(categoryLabel({ id: "c:custom-thing", label: "Mi categoría custom" }, "en")).toBe(
      "Mi categoría custom",
    );
  });
});
