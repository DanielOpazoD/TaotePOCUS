// Stub provider contract tests. The stub is the always-available
// fallback used in local dev + every other test that exercises the
// AI route handler. These tests pin its behavior so the rest of
// the codebase can rely on the deterministic output.

import { describe, expect, it } from "vitest";
import { stubProvider } from "@/lib/ai/stub";

// Disable the artificial 80ms delay for these tests — the stub
// gates that delay on `NODE_ENV !== "test"` so vitest already skips
// it; the env-var override is just a belt-and-suspenders.
process.env.AI_STUB_INSTANT = "1";

describe("stubProvider", () => {
  it("reports itself as always available", () => {
    expect(stubProvider.isAvailable()).toEqual({ available: true });
  });

  it("has the expected id + display name", () => {
    expect(stubProvider.id).toBe("stub");
    expect(stubProvider.displayName).toContain("Stub");
  });

  it("translates ES→EN with the marker prefix", async () => {
    const out = await stubProvider.translate({
      source: {
        title: "B-líneas confluentes",
        description: "Patrón intersticial bilateral.",
        tags: ["B-líneas", "pulmón"],
      },
      direction: "es-to-en",
    });
    expect(out.result.title).toBe("[stub ES→EN] B-líneas confluentes");
    expect(out.result.description).toBe("[stub ES→EN] Patrón intersticial bilateral.");
    expect(out.result.tags).toEqual(["en:B-líneas", "en:pulmón"]);
  });

  it("translates EN→ES with the inverse marker prefix", async () => {
    const out = await stubProvider.translate({
      source: {
        title: "Confluent B-lines",
        description: "Bilateral interstitial pattern.",
        tags: ["B-lines", "lung"],
      },
      direction: "en-to-es",
    });
    expect(out.result.title).toBe("[stub EN→ES] Confluent B-lines");
    expect(out.result.description).toBe("[stub EN→ES] Bilateral interstitial pattern.");
    expect(out.result.tags).toEqual(["es:B-lines", "es:lung"]);
  });

  it("returns the same output for the same input (deterministic)", async () => {
    const input = {
      source: { title: "Foo", description: "Bar.", tags: ["x", "y"] },
      direction: "es-to-en" as const,
    };
    const a = await stubProvider.translate(input);
    const b = await stubProvider.translate(input);
    expect(a.result).toEqual(b.result);
    // Meta differs only in `durationMs` (wall-clock); everything else is stable.
    expect(a.meta.provider).toBe(b.meta.provider);
    expect(a.meta.model).toBe(b.meta.model);
  });

  it("returns the correct meta envelope", async () => {
    const out = await stubProvider.translate({
      source: { title: "x", description: "y", tags: [] },
      direction: "es-to-en",
    });
    expect(out.meta.provider).toBe("stub");
    expect(out.meta.model).toBe("stub-deterministic-v1");
    expect(out.meta.promptTokens).toBeNull();
    expect(out.meta.completionTokens).toBeNull();
    expect(typeof out.meta.durationMs).toBe("number");
    expect(out.meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("handles empty tags arrays without crashing", async () => {
    const out = await stubProvider.translate({
      source: { title: "Solo titulo", description: "Solo body.", tags: [] },
      direction: "es-to-en",
    });
    expect(out.result.tags).toEqual([]);
  });

  it("accepts optional fewShotExamples without using them in the output", async () => {
    // Few-shot examples are accepted to keep the interface
    // contract-compatible across providers, but the stub ignores
    // them (its output is always the marker-prefix transform).
    const out = await stubProvider.translate({
      source: { title: "A", description: "B.", tags: ["c"] },
      direction: "es-to-en",
      fewShotExamples: [
        {
          es: { title: "Ejemplo", description: "Original.", tags: ["t"] },
          en: { title: "Example", description: "Translated.", tags: ["t"] },
        },
      ],
    });
    expect(out.result.title).toBe("[stub ES→EN] A");
  });
});
