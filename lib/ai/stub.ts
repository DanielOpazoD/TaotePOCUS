// Deterministic AI provider for local development + tests.
//
// Returns fixed transforms of its input so:
//
//   1. Local dev works without any API key (`npm run dev` →
//      open admin → AI panel → click "translate" → see a
//      plausible mock translation flow without burning real
//      credits).
//
//   2. Unit + e2e tests assert against known-output strings.
//      Since the transformation is pure, the same input always
//      produces the same output — no flake from temperature, no
//      cost from API calls.
//
// What the "translation" looks like: a deterministic English
// transformation of the Spanish source (and vice versa). It's not
// a real translation — it's a placeholder that PROVES the round-trip
// (UI → route handler → provider → schema validation → UI) works
// end-to-end. When the admin clicks through the diff UI, they see
// realistic-shaped content with the right field types, ready to
// review and either edit or discard.

import type {
  AICallMeta,
  AIProvider,
  AvailabilityCheck,
  TranslateInput,
  TranslateOutput,
} from "./provider";

/** Artificial latency so the UI's "loading…" state is visible
 *  during local dev. Short enough to not slow tests. */
const STUB_DELAY_MS = 80;

function transformText(text: string, direction: TranslateInput["direction"]): string {
  // Marker-based transformation so the test asserts on a stable
  // string. NOT a real translation. The "[stub ES→EN]" prefix lets
  // a reviewer see at a glance that this came from the stub and
  // not a real model.
  const marker = direction === "es-to-en" ? "[stub ES→EN]" : "[stub EN→ES]";
  return `${marker} ${text}`;
}

function transformTags(tags: string[], direction: TranslateInput["direction"]): string[] {
  // Same marker pattern per-tag. Empty input → empty output, same
  // shape, so JSON-schema validation never has to special-case it.
  const prefix = direction === "es-to-en" ? "en:" : "es:";
  return tags.map((t) => `${prefix}${t}`);
}

export const stubProvider: AIProvider = {
  id: "stub",
  displayName: "Stub (local · deterministic)",
  isAvailable(): AvailabilityCheck {
    // Always available — the stub is the no-network fallback the
    // app uses when no real provider has its env var set.
    return { available: true };
  },
  async translate(input: TranslateInput): Promise<TranslateOutput> {
    const start = Date.now();
    // Artificial delay so the React "loading…" state is observable
    // during dev. Skip in test environments via the env var.
    if (process.env.NODE_ENV !== "test" && process.env.AI_STUB_INSTANT !== "1") {
      await new Promise((r) => setTimeout(r, STUB_DELAY_MS));
    }
    const result = {
      title: transformText(input.source.title, input.direction),
      description: transformText(input.source.description, input.direction),
      tags: transformTags(input.source.tags, input.direction),
    };
    const meta: AICallMeta = {
      provider: "stub",
      model: "stub-deterministic-v1",
      promptTokens: null,
      completionTokens: null,
      durationMs: Date.now() - start,
    };
    return { result, meta };
  },
};
