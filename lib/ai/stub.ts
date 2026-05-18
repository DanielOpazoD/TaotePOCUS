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
  AutoTagInput,
  AutoTagOutput,
  AvailabilityCheck,
  RewriteInput,
  RewriteOutput,
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
  async rewriteCase(input: RewriteInput): Promise<RewriteOutput> {
    const start = Date.now();
    if (process.env.NODE_ENV !== "test" && process.env.AI_STUB_INSTANT !== "1") {
      await new Promise((r) => setTimeout(r, STUB_DELAY_MS));
    }
    // Deterministic markers so tests can assert on the output shape
    // without depending on a real model. The `[stub rewrite ES]`
    // prefix is recognizable to a reviewer as "this came from the
    // stub, replace before shipping".
    //
    // Note: pull source fields into local vars before string
    // interpolation. The localized-consumer audit otherwise flags
    // `${input.source.title}` as a possible LocalizedString
    // stringification (false positive — `LocalizedCaseContent.title`
    // is a plain `string`, not a `LocalizedString`).
    const srcTitle = input.source.title;
    const srcDescription = input.source.description;
    const srcTags = input.source.tags;
    const instructionSuffix = input.instruction ? ` (custom: ${input.instruction})` : "";
    const es = {
      title: `[stub rewrite ES] ${srcTitle}${instructionSuffix}`,
      description: `[stub rewrite ES] hallazgos ecográficos: ${srcDescription}`,
      tags: srcTags.length > 0 ? srcTags : ["stub-tag-es"],
    };
    const en = {
      title: `[stub rewrite EN] ${srcTitle}${instructionSuffix}`,
      description: `[stub rewrite EN] ultrasound findings: ${srcDescription}`,
      tags: srcTags.length > 0 ? srcTags.map((t) => `en:${t}`) : ["stub-tag-en"],
    };
    const meta: AICallMeta = {
      provider: "stub",
      model: "stub-deterministic-v1",
      promptTokens: null,
      completionTokens: null,
      durationMs: Date.now() - start,
    };
    return { result: { es, en }, meta };
  },
  async autoTag(input: AutoTagInput): Promise<AutoTagOutput> {
    const start = Date.now();
    if (process.env.NODE_ENV !== "test" && process.env.AI_STUB_INSTANT !== "1") {
      await new Promise((r) => setTimeout(r, STUB_DELAY_MS));
    }
    // Deterministic tag synthesis: pull the first 3 distinct
    // single-word lowercase tokens from the title+description. Test
    // assertions can rely on the shape (string[] of len 1-3) and on
    // the fact that the output is derived from the input.
    const srcTitle = input.source.title;
    const srcDescription = input.source.description;
    const words = `${srcTitle} ${srcDescription}`
      .toLowerCase()
      .split(/[^a-záéíóúñü]+/i)
      .filter((w) => w.length > 3);
    const distinct = Array.from(new Set(words)).slice(0, 3);
    // Fall back to a single placeholder when the source is too short
    // to yield any tokens (defends the contract: 1-3 tags always).
    const es = distinct.length > 0 ? distinct : ["stub-tag-es"];
    const en = es.map((t) => `en:${t}`);
    const meta: AICallMeta = {
      provider: "stub",
      model: "stub-deterministic-v1",
      promptTokens: null,
      completionTokens: null,
      durationMs: Date.now() - start,
    };
    return { result: { es, en }, meta };
  },
};
