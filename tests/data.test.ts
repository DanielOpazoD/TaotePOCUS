// Pin invariants of `lib/data.ts` — the static catalog source of
// truth. Renaming any of these constants silently would break:
//   - data persistence (the import script writes the tag value
//     into `CaseRecord.tags.es`),
//   - the classifier filter that finds those cases ("unclassified"
//     queue),
//   - the toString-based migration path between deploys.
//
// This file pins the values that have BACK-COMPAT semantics so a
// rename can't slip through without intent.

import { describe, expect, it } from "vitest";
import { CATEGORIES, IMPORT_MARKER_TAG, SECTIONS } from "@/lib/data";

describe("lib/data — IMPORT_MARKER_TAG", () => {
  it("is the literal `Sin clasificar` (back-compat with imported corpus)", () => {
    // The import script (`scripts/apply-twitter-import.mjs`) has
    // historically written this exact string into every case it
    // imports. Existing JSON corpora and live DB rows carry it as
    // the literal "Sin clasificar". Changing this value requires a
    // data migration — pin it here so the rename surfaces loudly.
    expect(IMPORT_MARKER_TAG).toBe("Sin clasificar");
  });

  it("is a non-empty string (defensive — used inside .filter / .includes)", () => {
    expect(typeof IMPORT_MARKER_TAG).toBe("string");
    expect(IMPORT_MARKER_TAG.length).toBeGreaterThan(0);
  });
});

describe("lib/data — sections + categories shape", () => {
  it("ships exactly the expected built-in section ids", () => {
    // SectionId is a literal union; the array must mirror it.
    // `ocular` + `neurocritico` briefly lived here (PR #103) but
    // moved to CATEGORIES in PR #108 — see the next assertion.
    expect(SECTIONS.map((s) => s.id).sort()).toEqual(
      ["atlas", "cases", "ecg", "info", "rayos"].sort(),
    );
  });

  it("ships exactly the expected built-in category ids", () => {
    // `ocular` + `neurocritico` added in May-2026 (PR #108) as
    // Atlas categories.
    expect(CATEGORIES.map((c) => c.id).sort()).toEqual(
      [
        "abdominal",
        "cardiac",
        "fast",
        "lung",
        "ms",
        "neurocritico",
        "ob",
        "ocular",
        "proc",
        "vascular",
      ].sort(),
    );
  });
});
