// Unit tests for the case-description helper. The fallback chain
// the previous version of these tests pinned down was removed in
// May-2026 (ADR-0010) when `description` was promoted to the only
// body field on `CaseRecord`. The remaining tests pin the helper's
// minimal contract: it's the single read/write seam.

import { describe, expect, it } from "vitest";

import { getDescription, setDescription } from "@/lib/case-description";
import { caseFactory } from "./fixtures";

describe("getDescription", () => {
  it("returns the canonical `description` value", () => {
    const c = caseFactory({ description: "Patrón B confluente bilateral." });
    expect(getDescription(c)).toBe("Patrón B confluente bilateral.");
  });

  it("preserves whitespace-only values verbatim (no trimming)", () => {
    // The helper is a read seam, not a sanitizer. Callers that need
    // trimming should do it explicitly so the contract stays
    // predictable.
    const c = caseFactory({ description: "   " });
    expect(getDescription(c)).toBe("   ");
  });
});

describe("setDescription", () => {
  it("writes the canonical `description` field as a bilingual slot", () => {
    // Phase-2 i18n: `description` widened from `string` to
    // `LocalizedString = { es; en? }`. The helper writes to the
    // ES slot — the EN translation, when present, is preserved
    // by passing the previous value via the second arg.
    expect(setDescription("Hello.")).toEqual({ description: { es: "Hello." } });
  });

  it("preserves the existing EN slot when only ES is being edited", () => {
    const patch = setDescription("Spanish edit.", { es: "Old", en: "Existing English" });
    expect(patch).toEqual({
      description: { es: "Spanish edit.", en: "Existing English" },
    });
  });

  it("returns a Partial<CaseRecord> — only the description key", () => {
    // Symmetry with `getDescription`: one named write seam, no
    // hidden mirrors to other fields. If a future migration needs
    // to fan out (e.g. cache invalidation tags), this is the place.
    const patch = setDescription("New text");
    expect(Object.keys(patch)).toEqual(["description"]);
  });
});
