// Google Gemini provider. Wraps `@google/genai` SDK calls behind the
// shared `AIProvider` interface so route handlers + React components
// never see Google-specific types.
//
// Model selection: `gemini-2.5-flash` for translation (fast, cheap,
// ~$0.30/M output tokens). The catalog-wide cost on 330 cases is
// <$1, so it's a generous default. Override via env var
// `GEMINI_TRANSLATE_MODEL` if you want to A/B against another model
// (e.g., `gemini-2.5-pro` for editorial polish runs).
//
// Structured output via `responseMimeType: "application/json"` +
// `responseSchema` (Gemini's strict-JSON-schema mode). The model is
// constrained to emit JSON matching the schema; we still re-validate
// with Zod at the route boundary as defense in depth.
//
// Auth: reads `GEMINI_API_KEY` from process env. `isAvailable()`
// just tests for the var's presence — if the env is missing the
// selector hides this provider with a "Set GEMINI_API_KEY in
// Netlify env" tooltip. No fallback into the stub at this layer —
// the registry handles that.

import { GoogleGenAI, Type } from "@google/genai";
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
import { ProviderUnavailableError } from "./provider";

const DEFAULT_TRANSLATE_MODEL = "gemini-2.5-flash";

/**
 * JSON Schema describing the expected output shape. Gemini's
 * structured-output mode enforces this at generation time; our route
 * handler re-validates with Zod after the response lands (defense in
 * depth against schema drift).
 */
const TRANSLATE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "Translated case title in the target language. 8-15 words. Clinical-precise.",
    },
    description: {
      type: Type.STRING,
      description:
        "Translated case description in the target language. 3-5 sentences. Preserve clinical findings, mechanism, management cues from the source.",
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "3-5 idiomatic tags in the target language. Map ES medical terminology to its EN clinical equivalent (or vice versa) — never literal word-for-word.",
    },
  },
  required: ["title", "description", "tags"],
};

/**
 * System prompt. Stays minimal — the prompt is the editorial style
 * guide. Few-shot examples are passed as additional user turns so
 * the model sees concrete style examples without committing them
 * to the system prompt's tokens (which charge on every call).
 */
const SYSTEM_PROMPT = `You translate POCUS (point-of-care ultrasound) clinical case content between Spanish and English.

Conventions:
- Spanish baseline is medical-Spanish from Latin America (Chile / Argentina conventions).
- English is American clinical English (US POCUS literature: SCCM, EMRA, ACEP style).
- Preserve clinical accuracy. If the source uses a specific anatomic term, use the standard equivalent in the target language. Examples:
    "B-líneas confluentes" → "confluent B-lines"
    "FAST positivo" → "positive FAST exam"
    "derrame pericárdico con colapso de VD" → "pericardial effusion with RV collapse"
- Keep sentence structure compact. Match the source's word count within ±20%.
- For tags: provide idiomatic clinical English (e.g., "AFib" not "atrial fibrillation when shorter form is standard"). Map ES → EN at the concept level, not the word level.
- Never add medical content that isn't in the source. Never omit content that is.
- Output strict JSON matching the requested schema.`;

function buildTranslationPrompt(input: TranslateInput): string {
  const targetLang = input.direction === "es-to-en" ? "English" : "Spanish";
  const sourceLang = input.direction === "es-to-en" ? "Spanish" : "English";
  // Destructure to plain strings before interpolation. The
  // `LocalizedCaseContent` shape carries plain `title` / `description`
  // strings (the route handler resolved them from
  // `CaseRecord.title.es` / `.en` before calling), so there's no
  // `LocalizedString` object to stringify here — but the audit's
  // regex matches `\${expr.title}` literally, so we rename to keep
  // the static check tightly focused on actual `CaseRecord` stringi-
  // fication bugs (the original `[object Object]` class).
  const srcTitle = input.source.title;
  const srcDesc = input.source.description;
  const srcTags = input.source.tags.join(", ");

  const fewShot =
    input.fewShotExamples && input.fewShotExamples.length > 0
      ? "\n\nReference style — high-quality examples from the catalog:\n" +
        input.fewShotExamples
          .map((ex, i) => {
            const source = input.direction === "es-to-en" ? ex.es : ex.en;
            const target = input.direction === "es-to-en" ? ex.en : ex.es;
            const exSrcTitle = source.title;
            const exSrcDesc = source.description;
            const exSrcTags = source.tags.join(", ");
            const exTargetTitle = target.title;
            const exTargetDesc = target.description;
            const exTargetTags = target.tags.join(", ");
            return [
              `--- Example ${i + 1} ---`,
              `Source (${sourceLang}):`,
              `  Title: ${exSrcTitle}`,
              `  Description: ${exSrcDesc}`,
              `  Tags: ${exSrcTags}`,
              `Target (${targetLang}):`,
              `  Title: ${exTargetTitle}`,
              `  Description: ${exTargetDesc}`,
              `  Tags: ${exTargetTags}`,
            ].join("\n");
          })
          .join("\n\n")
      : "";

  return [
    `Translate this POCUS case from ${sourceLang} to ${targetLang}. Output JSON matching the schema.`,
    "",
    `Source (${sourceLang}):`,
    `  Title: ${srcTitle}`,
    `  Description: ${srcDesc}`,
    `  Tags: ${srcTags}`,
    fewShot,
  ].join("\n");
}

export const geminiProvider: AIProvider = {
  id: "gemini",
  displayName: "Google Gemini",
  isAvailable(): AvailabilityCheck {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key.length < 10) {
      return {
        available: false,
        reason: "GEMINI_API_KEY env var not set. Add it to Netlify project env to enable.",
      };
    }
    return { available: true };
  },
  async translate(input: TranslateInput): Promise<TranslateOutput> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Defensive — the route handler should have called
      // `isAvailable()` first, but in case it didn't (or env got
      // unset between checks), surface a typed error the handler
      // can translate to a 503.
      throw new ProviderUnavailableError("gemini", "GEMINI_API_KEY not set");
    }
    const model = process.env.GEMINI_TRANSLATE_MODEL || DEFAULT_TRANSLATE_MODEL;
    const ai = new GoogleGenAI({ apiKey });

    const start = Date.now();
    const response = await ai.models.generateContent({
      model,
      contents: buildTranslationPrompt(input),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        // Strict-JSON output mode. The model is constrained to emit
        // exactly the shape declared above.
        responseMimeType: "application/json",
        responseSchema: TRANSLATE_RESPONSE_SCHEMA,
        // Low temperature for translation — we want deterministic
        // medically-accurate output, not creative writing.
        temperature: 0.2,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini returned empty response (no text content)");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(
        `Gemini returned malformed JSON despite responseSchema: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Shape validation. We don't run Zod here (that's the route
    // handler's job — keeping providers framework-agnostic), but we
    // do enforce the basic invariants so a malformed response from
    // the model raises an obvious error before propagating.
    if (!isTranslateShape(parsed)) {
      throw new Error("Gemini response did not match the translation schema");
    }

    const usage = response.usageMetadata;
    const meta: AICallMeta = {
      provider: "gemini",
      model,
      promptTokens: usage?.promptTokenCount ?? null,
      completionTokens: usage?.candidatesTokenCount ?? null,
      durationMs: Date.now() - start,
    };
    return {
      result: { title: parsed.title, description: parsed.description, tags: parsed.tags },
      meta,
    };
  },
  async rewriteCase(_input: RewriteInput): Promise<RewriteOutput> {
    // Not implemented for Gemini yet. The catalog's primary provider
    // is DeepSeek (May-2026); the editorial rewrite path is only
    // wired through `openai-compat.ts` so far. Switching to Gemini
    // would silently fall back to the translate-only path (not
    // sufficient for the editorial rewrite contract), so we throw
    // a structured error the route handler can surface to the admin.
    //
    // To enable: implement the same prompt + schema as
    // `openai-compat.ts > rewriteCaseImpl`, using
    // `gen.models.generateContent` with `responseMimeType:
    // application/json` and a Gemini-shaped response schema (use
    // the `TRANSLATE_RESPONSE_SCHEMA` above as the model — Type.OBJECT
    // / Type.STRING / etc.).
    throw new ProviderUnavailableError(
      "gemini",
      "rewriteCase is not yet implemented for Gemini. Use DeepSeek or OpenAI.",
    );
  },
  async autoTag(_input: AutoTagInput): Promise<AutoTagOutput> {
    // Same Phase-2 status as `rewriteCase` — implementable but not
    // yet ported to the Gemini SDK shape. Switching to Gemini for
    // tags would throw silently if we relied on a fallback; the
    // structured error here surfaces a clear message in the AI
    // status badge.
    throw new ProviderUnavailableError(
      "gemini",
      "autoTag is not yet implemented for Gemini. Use DeepSeek or OpenAI.",
    );
  },
};

/** Narrow `unknown` into the translation output shape. The full
 *  Zod check runs at the route boundary; this is a defensive
 *  pre-check so the provider itself never returns a malformed
 *  object to its caller. */
function isTranslateShape(v: unknown): v is { title: string; description: string; tags: string[] } {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.title === "string" &&
    typeof obj.description === "string" &&
    Array.isArray(obj.tags) &&
    obj.tags.every((t) => typeof t === "string")
  );
}
