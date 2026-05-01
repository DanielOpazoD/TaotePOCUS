// Unit tests for the case-description helper. These pin down the
// migration story so a future refactor can't silently break the
// fallback chain that the imported corpus depends on.

import { describe, expect, it } from "vitest";

import { getDescription, setDescription } from "@/lib/case-description";
import { caseFactory } from "./fixtures";

describe("getDescription", () => {
  it("returns the canonical `description` when set", () => {
    const c = caseFactory({
      description: "New canonical body.",
      findings: "Old findings.",
      summary: "Old summary.",
      diagnosis: "Old diagnosis.",
    });
    expect(getDescription(c)).toBe("New canonical body.");
  });

  it("falls back to `findings` when `description` is empty", () => {
    // The 326 imported cases land here: no `description` field, but
    // `findings` populated from the source tweet text.
    const c = caseFactory({
      description: undefined,
      findings: "Patrón B confluente bilateral.",
      summary: "",
      diagnosis: "",
    });
    expect(getDescription(c)).toBe("Patrón B confluente bilateral.");
  });

  it("falls through `findings → summary → diagnosis`", () => {
    const c = caseFactory({
      description: undefined,
      findings: "",
      summary: "Summary text.",
      diagnosis: "Diagnosis text.",
    });
    expect(getDescription(c)).toBe("Summary text.");

    const onlyDx = caseFactory({
      description: undefined,
      findings: "",
      summary: "",
      diagnosis: "Diagnosis text.",
    });
    expect(getDescription(onlyDx)).toBe("Diagnosis text.");
  });

  it("returns an empty string when every slot is empty", () => {
    const c = caseFactory({
      description: undefined,
      findings: "",
      summary: "",
      diagnosis: "",
    });
    expect(getDescription(c)).toBe("");
  });

  it("treats whitespace-only fields as filled (consumer trims if needed)", () => {
    // Intentional: the helper is a *fallback chain*, not a string
    // sanitizer. A whitespace-only `description` still wins over a
    // populated `findings`. Callers that want to trim should do it
    // explicitly — this keeps the helper predictable and lossless.
    const c = caseFactory({
      description: "   ",
      findings: "Real content.",
    });
    expect(getDescription(c)).toBe("   ");
  });
});

describe("setDescription", () => {
  it("writes to the canonical `description` field", () => {
    expect(setDescription("Hello.")).toEqual({ description: "Hello." });
  });

  it("does not touch the legacy fields", () => {
    // Critical contract: even if a future contributor passes a long
    // text, we never silently mirror it to `findings` / `summary` /
    // `diagnosis`. That mirroring would re-introduce the duplication
    // problem the May-2026 migration was meant to fix.
    const patch = setDescription("New text");
    expect(patch).not.toHaveProperty("findings");
    expect(patch).not.toHaveProperty("summary");
    expect(patch).not.toHaveProperty("diagnosis");
  });
});
