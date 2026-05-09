// Storage migrations — runs once per app start, upgrades persisted
// shapes between schema versions. Pinned with focused unit tests
// because the consequences of getting them wrong are visible
// (production crash on the next reload, lost user data).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  __resetSchemaVersionForTests,
  runStorageMigrations,
} from "@/lib/storage-migrations";
import { STORAGE_KEYS } from "@/lib/storage-keys";

describe("storage-migrations", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetSchemaVersionForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("writes the current version stamp on first run from a clean install", () => {
    runStorageMigrations();
    expect(localStorage.getItem(STORAGE_KEYS.schemaVersion)).toBe(String(CURRENT_SCHEMA_VERSION));
  });

  it("is idempotent — running twice doesn't re-process", () => {
    // Pre-populate a payload that would normally be migrated.
    localStorage.setItem(
      STORAGE_KEYS.userCases,
      JSON.stringify([
        { id: "c1", title: "Legacy", description: "Body", tags: ["a", "b"], section: "atlas" },
      ]),
    );

    runStorageMigrations();
    const afterFirst = localStorage.getItem(STORAGE_KEYS.userCases);

    // Second run should short-circuit (version stamp matches).
    runStorageMigrations();
    const afterSecond = localStorage.getItem(STORAGE_KEYS.userCases);

    expect(afterSecond).toBe(afterFirst);
  });

  it("short-circuits when version stamp is already at latest", () => {
    localStorage.setItem(STORAGE_KEYS.schemaVersion, String(CURRENT_SCHEMA_VERSION));
    // A legacy payload is left untouched because we trust the stamp.
    const legacy = [{ id: "c1", title: "Stale", tags: ["x"], section: "atlas" }];
    localStorage.setItem(STORAGE_KEYS.userCases, JSON.stringify(legacy));
    runStorageMigrations();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.userCases)!)).toEqual(legacy);
  });

  describe("v1 — Phase-2/3 bilingual shape upgrade", () => {
    it("upgrades user-cases title / description / tags to LocalizedString shape", () => {
      localStorage.setItem(
        STORAGE_KEYS.userCases,
        JSON.stringify([
          {
            id: "c1",
            section: "atlas",
            category: "lung",
            modality: "POCUS",
            loop: "blines",
            author: "A",
            role: "R",
            date: "2026-01-01",
            title: "Legacy title",
            description: "Legacy body",
            tags: ["B-líneas", "Crítico"],
          },
        ]),
      );

      runStorageMigrations();

      const upgraded = JSON.parse(localStorage.getItem(STORAGE_KEYS.userCases)!);
      expect(upgraded[0].title).toEqual({ es: "Legacy title" });
      expect(upgraded[0].description).toEqual({ es: "Legacy body" });
      expect(upgraded[0].tags).toEqual({ es: ["B-líneas", "Crítico"] });
      // Non-bilingual fields untouched.
      expect(upgraded[0].id).toBe("c1");
      expect(upgraded[0].section).toBe("atlas");
      expect(upgraded[0].category).toBe("lung");
    });

    it("upgrades override-map entries with bilingual fields, leaves others alone", () => {
      localStorage.setItem(
        STORAGE_KEYS.caseOverrides,
        JSON.stringify({
          "tw-1": { title: "Edited" },
          "tw-2": { tags: ["one"], featured: true },
          "tw-3": { reviewed: true }, // no bilingual fields — pass-through
        }),
      );

      runStorageMigrations();

      const overrides = JSON.parse(localStorage.getItem(STORAGE_KEYS.caseOverrides)!);
      expect(overrides["tw-1"]).toEqual({ title: { es: "Edited" } });
      expect(overrides["tw-2"]).toEqual({ tags: { es: ["one"] }, featured: true });
      expect(overrides["tw-3"]).toEqual({ reviewed: true });
    });

    it("upgrades custom-categories labels to LocalizedString", () => {
      localStorage.setItem(
        STORAGE_KEYS.customCategories,
        JSON.stringify([
          { id: "c:peds", label: "Pediatría" },
          { id: "c:trauma", label: "Trauma" },
        ]),
      );

      runStorageMigrations();

      const cats = JSON.parse(localStorage.getItem(STORAGE_KEYS.customCategories)!);
      expect(cats).toEqual([
        { id: "c:peds", label: { es: "Pediatría" } },
        { id: "c:trauma", label: { es: "Trauma" } },
      ]);
    });

    it("upgrades section-label overrides to LocalizedString", () => {
      localStorage.setItem(
        STORAGE_KEYS.sectionLabelOverrides,
        JSON.stringify({ atlas: "Atlas pediátrico", ecg: "ECG" }),
      );

      runStorageMigrations();

      const overrides = JSON.parse(localStorage.getItem(STORAGE_KEYS.sectionLabelOverrides)!);
      expect(overrides).toEqual({
        atlas: { es: "Atlas pediátrico" },
        ecg: { es: "ECG" },
      });
    });

    it("preserves modern-shape entries without re-wrapping (idempotent on already-upgraded data)", () => {
      // Simulate a partial migration: schema version says 0 but the
      // entries are already in the modern shape (unusual — could
      // happen if the version stamp got corrupted but the data was
      // freshly written by Phase-2 code).
      localStorage.setItem(
        STORAGE_KEYS.customCategories,
        JSON.stringify([{ id: "c:peds", label: { es: "Pediatría", en: "Pediatrics" } }]),
      );

      runStorageMigrations();

      const cats = JSON.parse(localStorage.getItem(STORAGE_KEYS.customCategories)!);
      expect(cats).toEqual([{ id: "c:peds", label: { es: "Pediatría", en: "Pediatrics" } }]);
    });

    it("drops malformed custom categories (no usable ES label)", () => {
      localStorage.setItem(
        STORAGE_KEYS.customCategories,
        JSON.stringify([
          { id: "c:ok", label: "Valid" },
          { id: "c:bad", label: "" }, // empty ES — drop
          { label: "no-id" }, // missing id — drop
          null,
          "string entry",
        ]),
      );

      runStorageMigrations();

      const cats = JSON.parse(localStorage.getItem(STORAGE_KEYS.customCategories)!);
      expect(cats).toEqual([{ id: "c:ok", label: { es: "Valid" } }]);
    });

    it("survives malformed JSON in any single key (logs and moves on)", () => {
      // Corrupt one key — the migration shouldn't throw or stop the
      // others.
      localStorage.setItem(STORAGE_KEYS.userCases, "not-valid-json}}");
      localStorage.setItem(
        STORAGE_KEYS.customCategories,
        JSON.stringify([{ id: "c:peds", label: "Pediatría" }]),
      );

      expect(() => runStorageMigrations()).not.toThrow();

      // The intact key still got upgraded.
      const cats = JSON.parse(localStorage.getItem(STORAGE_KEYS.customCategories)!);
      expect(cats[0].label).toEqual({ es: "Pediatría" });
      // Version stamp advanced — we're at the latest.
      expect(localStorage.getItem(STORAGE_KEYS.schemaVersion)).toBe(String(CURRENT_SCHEMA_VERSION));
    });
  });
});
