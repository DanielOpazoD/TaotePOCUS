// OpenAI-compatible client. Covers actual OpenAI AND any provider
// that exposes the same chat-completions schema — currently DeepSeek
// (their API was designed to be a drop-in replacement). Adding more
// (Groq, Together AI, Mistral La Plateforme) is just a new wrapper
// in this file with a different baseURL + model + env var.
//
// Why one file for both: OpenAI's official SDK accepts a `baseURL`
// constructor option. Pointing it at `https://api.deepseek.com`
// changes nothing else — same `client.chat.completions.create()`
// call, same response shape, same `response_format.json_schema`
// structured-output mode. We get the OpenAI SDK's polish and TS
// types for both providers with a single dependency.
//
// Model selection: env-var override per provider so a maintainer
// can A/B different models without code changes.

import OpenAI from "openai";
import type {
  AICallMeta,
  AIProvider,
  AvailabilityCheck,
  ProviderId,
  RewriteInput,
  RewriteOutput,
  TranslateInput,
  TranslateOutput,
} from "./provider";
import { ProviderUnavailableError } from "./provider";

/**
 * JSON Schema in OpenAI's strict-mode shape. Properties + required
 * + additionalProperties:false is mandatory for `strict: true`.
 */
const TRANSLATE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["title", "description", "tags"],
  additionalProperties: false,
} as const;

/**
 * Shared system prompt. Identical philosophy to the Gemini
 * provider's prompt — keep the providers' editorial guidance
 * aligned so switching between them produces comparable output.
 */
const SYSTEM_PROMPT = `You translate POCUS (point-of-care ultrasound) clinical case content between Spanish and English.

Conventions:
- Spanish baseline is medical-Spanish from Latin America (Chile / Argentina conventions).
- English is American clinical English (US POCUS literature: SCCM, EMRA, ACEP style).
- Preserve clinical accuracy. Match common ES↔EN clinical-term mappings (e.g. "B-líneas confluentes" ↔ "confluent B-lines").
- Match source word count within ±20%. Don't add medical content not in the source. Don't omit content from the source.
- For tags: idiomatic clinical English. Map concepts, not words.
- Output strict JSON: { "title": string, "description": string, "tags": string[] }.`;

function buildUserPrompt(input: TranslateInput): string {
  const targetLang = input.direction === "es-to-en" ? "English" : "Spanish";
  const sourceLang = input.direction === "es-to-en" ? "Spanish" : "English";
  // Destructure to plain strings before interpolation — see the
  // matching note in `gemini.ts > buildTranslationPrompt`. The
  // `LocalizedCaseContent` shape is plain strings, not the bilingual
  // `LocalizedString` object, but the localized-consumer audit's
  // regex matches `${expr.title}` literally; we keep the static
  // check tight by avoiding that pattern here.
  const srcTitle = input.source.title;
  const srcDesc = input.source.description;
  const srcTags = input.source.tags.join(", ");

  const fewShot =
    input.fewShotExamples && input.fewShotExamples.length > 0
      ? "\n\nReference style — high-quality bilingual examples:\n" +
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
              `${sourceLang} title: ${exSrcTitle}`,
              `${sourceLang} description: ${exSrcDesc}`,
              `${sourceLang} tags: ${exSrcTags}`,
              `${targetLang} title: ${exTargetTitle}`,
              `${targetLang} description: ${exTargetDesc}`,
              `${targetLang} tags: ${exTargetTags}`,
            ].join("\n");
          })
          .join("\n\n")
      : "";
  return [
    `Translate this POCUS case from ${sourceLang} to ${targetLang}.`,
    "",
    `Source title: ${srcTitle}`,
    `Source description: ${srcDesc}`,
    `Source tags: ${srcTags}`,
    fewShot,
  ].join("\n");
}

/**
 * Which structured-output mode to use on the `response_format` field.
 *
 *   - `"json_schema"` (OpenAI proper): the model is constrained at
 *     generation time to a strict JSON schema. Guarantees parseable
 *     JSON matching the schema; rejects token sequences that would
 *     break it. Available only on OpenAI's own models (gpt-4o+,
 *     gpt-5*, etc.) — third-party OpenAI-compatible APIs typically
 *     don't implement it.
 *
 *   - `"json_object"` (broader compatibility, including DeepSeek):
 *     the model is asked to output JSON; no schema constraint at
 *     generation time. The prompt explicitly asks for the expected
 *     shape ("Output strict JSON: { title, description, tags }")
 *     and `isTranslateShape()` validates client-side after parsing.
 *     If the model returns malformed JSON or the wrong shape, the
 *     route handler surfaces a structured error.
 *
 * History: this used to be hardcoded to `json_schema` for both
 * OpenAI and DeepSeek. DeepSeek returned `400 This response_format
 * type is unavailable now` because their API only supports the
 * `json_object` variant. Per-provider configuration keeps OpenAI's
 * stronger guarantees while letting DeepSeek work.
 */
type JsonMode = "json_schema" | "json_object";

/**
 * Build a provider that talks to an OpenAI-compatible endpoint.
 * Used twice below — once for OpenAI proper, once for DeepSeek.
 * The same chat-completions request shape works for both, modulo
 * the `jsonMode` switch (see type above).
 */
function buildOpenAICompatProvider({
  id,
  displayName,
  envVarName,
  baseURL,
  defaultModel,
  modelEnvVarName,
  jsonMode,
}: {
  id: ProviderId;
  displayName: string;
  envVarName: string;
  /** `undefined` for OpenAI itself (SDK default). Set for compatible providers. */
  baseURL?: string;
  defaultModel: string;
  modelEnvVarName: string;
  /** Which `response_format` variant the provider's API supports. */
  jsonMode: JsonMode;
}): AIProvider {
  return {
    id,
    displayName,
    isAvailable(): AvailabilityCheck {
      const key = process.env[envVarName];
      if (!key || key.length < 10) {
        return {
          available: false,
          reason: `${envVarName} env var not set. Add it to Netlify project env to enable.`,
        };
      }
      return { available: true };
    },
    async translate(input: TranslateInput): Promise<TranslateOutput> {
      const apiKey = process.env[envVarName];
      if (!apiKey) {
        throw new ProviderUnavailableError(id, `${envVarName} not set`);
      }
      const model = process.env[modelEnvVarName] || defaultModel;
      const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });

      // Build the response_format payload. The cast is needed
      // because the OpenAI SDK types narrow `response_format` to
      // each specific shape; `JsonMode` is a discriminator that
      // produces one of the two valid variants at runtime.
      const responseFormat =
        jsonMode === "json_schema"
          ? ({
              type: "json_schema" as const,
              json_schema: {
                name: "translation",
                strict: true,
                schema: TRANSLATE_RESPONSE_SCHEMA,
              },
            } as const)
          : ({ type: "json_object" as const } as const);

      const start = Date.now();
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
        response_format: responseFormat,
        temperature: 0.2,
      });

      const choice = response.choices[0];
      const text = choice?.message?.content;
      if (!text) {
        throw new Error(`${id} returned empty response (no message content)`);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error(
          `${id} returned malformed JSON (mode=${jsonMode}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Shape validation. For `json_schema` mode the API guarantees
      // the shape, so this is belt-and-suspenders. For `json_object`
      // mode the API only guarantees parseable JSON — the shape is
      // enforced here, and a mismatch surfaces as a 502 to the UI.
      if (!isTranslateShape(parsed)) {
        throw new Error(
          `${id} response did not match the translation schema { title, description, tags[] } (mode=${jsonMode})`,
        );
      }

      const usage = response.usage;
      const meta: AICallMeta = {
        provider: id,
        model,
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
        durationMs: Date.now() - start,
      };
      return {
        result: { title: parsed.title, description: parsed.description, tags: parsed.tags },
        meta,
      };
    },
    async rewriteCase(input: RewriteInput): Promise<RewriteOutput> {
      const apiKey = process.env[envVarName];
      if (!apiKey) {
        throw new ProviderUnavailableError(id, `${envVarName} not set`);
      }
      const model = process.env[modelEnvVarName] || defaultModel;
      // Delegate to the shared implementation. The provider closure
      // carries the auth/model/jsonMode config; the implementation
      // assembles the OpenAI request + validates the response.
      return rewriteCaseImpl({ id, apiKey, baseURL, model, jsonMode, input });
    },
  };
}

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

/**
 * Editorial system prompt for `rewriteCase`. Encodes the catalog's
 * editorial conventions so the AI rewrites BOTH languages following
 * the same rules.
 *
 * The rules are derived from how the editorial team uses the catalog:
 *
 *   - **Title = visible diagnosis**, not clinical history. The
 *     catalog is a SONOGRAPHIC reference — a reader scanning titles
 *     should learn what each case LOOKS LIKE on US, not what symptom
 *     the patient presented with.
 *   - **Description = US findings only**. Clinical context belongs
 *     in the (separate, optional) advanced fields, not the main
 *     description. A reader using the catalog as an image bank
 *     needs to know "what does this image show?", not "how did this
 *     patient end up here?".
 *   - **Tags = clinical idioms in each language**. Not literal
 *     translations — concept mappings. "B-líneas" doesn't translate
 *     to "B-line" (singular), it translates to "B-lines" (plural,
 *     idiomatic) or sometimes "wet lungs" depending on context.
 *
 * Per-call user instruction is appended as a second user message
 * after this system message, so it can refine but not override the
 * editorial rules.
 */
const REWRITE_SYSTEM_PROMPT = `You are an editorial assistant for a bilingual POCUS (point-of-care ultrasound) clinical educational catalog. The catalog ships in Spanish (canonical) + English (translation).

TASK: Given a case in Spanish (title, description, tags), produce a refined Spanish version AND an English translation that BOTH follow these editorial rules.

EDITORIAL RULES — apply to BOTH languages:

1. TITLE. Must reflect the SONOGRAPHIC diagnosis (what is visible in the ultrasound image / loop), NOT the clinical history.
   - GOOD ES: "Edema pulmonar agudo (B-líneas confluentes bilaterales)"
   - GOOD EN: "Acute pulmonary edema (confluent bilateral B-lines)"
   - BAD: "Paciente con disnea progresiva" / "Patient with progressive dyspnea"
   - If the original title is a clinical-history phrase, INFER the likely sonographic diagnosis from the description.

2. DESCRIPTION. ONLY ultrasound findings. OMIT clinical case narrative.
   - INCLUDE: anatomical view, B-lines, A-lines, sliding, effusions, hyperechoic/hypoechoic, dimensions, motion patterns, probe type if mentioned.
   - OMIT: patient demographics, symptoms, physical exam findings outside US, lab values, treatment, outcome, follow-up.
   - Style: structured radiologic-style report. Concise but specific.
   - Length: 1-3 sentences typical, max 5.
   - If the original description has ONLY clinical narrative and no US findings, write a brief description of what such a case typically LOOKS LIKE on US, marked clearly as inferred.

3. TAGS. 3-5 idiomatic clinical tags in EACH language.
   - Map concepts, not words.
   - Spanish: Latin American medical Spanish (Chile/Argentina conventions).
   - English: American clinical English (SCCM / EMRA / ACEP style).
   - Example: ["B-líneas", "pulmón húmedo", "edema intersticial"] ↔ ["B-lines", "wet lungs", "interstitial syndrome"]

OUTPUT: strict JSON, no preamble, no markdown fences.
{
  "es": { "title": string, "description": string, "tags": string[] },
  "en": { "title": string, "description": string, "tags": string[] }
}`;

/**
 * Strict JSON schema for the rewrite response. Used in
 * \`response_format: { type: "json_schema" }\` mode on OpenAI proper.
 * DeepSeek falls back to \`json_object\` mode (see deepseekProvider
 * jsonMode below) and validates the shape client-side via
 * \`isRewriteShape\`.
 */
const REWRITE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    es: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "description", "tags"],
      additionalProperties: false,
    },
    en: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "description", "tags"],
      additionalProperties: false,
    },
  },
  required: ["es", "en"],
  additionalProperties: false,
} as const;

function isRewriteShape(
  v: unknown,
): v is {
  es: { title: string; description: string; tags: string[] };
  en: { title: string; description: string; tags: string[] };
} {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return isTranslateShape(obj.es) && isTranslateShape(obj.en);
}

/**
 * Concrete rewrite implementation shared by openaiProvider and
 * deepseekProvider. Takes the same `apiKey` / `model` / `baseURL` /
 * `jsonMode` config as the translate path because the OpenAI SDK is
 * the same; only the system prompt + response schema differ.
 */
async function rewriteCaseImpl(args: {
  id: ProviderId;
  apiKey: string;
  baseURL?: string;
  model: string;
  jsonMode: JsonMode;
  input: RewriteInput;
}): Promise<RewriteOutput> {
  const client = new OpenAI({
    apiKey: args.apiKey,
    ...(args.baseURL ? { baseURL: args.baseURL } : {}),
  });

  const responseFormat =
    args.jsonMode === "json_schema"
      ? ({
          type: "json_schema" as const,
          json_schema: {
            name: "case_rewrite",
            strict: true,
            schema: REWRITE_RESPONSE_SCHEMA,
          },
        } as const)
      : ({ type: "json_object" as const } as const);

  // Pull source fields into locals before interpolation. Same
  // reason as `stub.rewriteCase`: the localized-consumer audit
  // false-positives on `${something.title}` patterns. Here
  // `args.input.source` is a `LocalizedCaseContent` with plain
  // string fields, not a `LocalizedString`.
  const srcTitle = args.input.source.title;
  const srcDescription = args.input.source.description;
  const srcTags = args.input.source.tags;
  const sourceBlock = [
    `Source (Spanish):`,
    `Title: ${srcTitle}`,
    `Description: ${srcDescription}`,
    `Tags: ${srcTags.join(", ") || "(none)"}`,
  ].join("\n");

  const userInstruction = args.input.instruction?.trim();
  // Clamp the user instruction so an admin can't accidentally inject
  // a multi-kilobyte prompt and 10x the call cost. 500 chars is more
  // than enough for "be more concise" / "highlight differential" /
  // "use the dimensions if mentioned".
  const clampedInstruction =
    userInstruction && userInstruction.length > 500
      ? userInstruction.slice(0, 500)
      : userInstruction;
  const userMessageContent = clampedInstruction
    ? `${sourceBlock}\n\nAdditional instruction (apply alongside the editorial rules):\n${clampedInstruction}`
    : sourceBlock;

  const start = Date.now();
  const response = await client.chat.completions.create({
    model: args.model,
    messages: [
      { role: "system", content: REWRITE_SYSTEM_PROMPT },
      { role: "user", content: userMessageContent },
    ],
    response_format: responseFormat,
    // Slightly higher temperature than translate (0.2) because rewrite
    // is creative-ish: inferring a sonographic diagnosis from clinical
    // narrative isn't a 1:1 transformation. Capped at 0.4 to keep the
    // output stable enough that two consecutive calls don't produce
    // wildly different titles.
    temperature: 0.4,
  });

  const choice = response.choices[0];
  const text = choice?.message?.content;
  if (!text) {
    throw new Error(`${args.id} returned empty rewrite response (no message content)`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `${args.id} returned malformed JSON for rewrite (mode=${args.jsonMode}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!isRewriteShape(parsed)) {
    throw new Error(
      `${args.id} rewrite response did not match { es: {title, description, tags[]}, en: {title, description, tags[]} } (mode=${args.jsonMode})`,
    );
  }

  const usage = response.usage;
  const meta: AICallMeta = {
    provider: args.id,
    model: args.model,
    promptTokens: usage?.prompt_tokens ?? null,
    completionTokens: usage?.completion_tokens ?? null,
    durationMs: Date.now() - start,
  };
  return { result: { es: parsed.es, en: parsed.en }, meta };
}

/**
 * OpenAI proper. Default model: `gpt-5-mini` (smaller, ~$0.25/M
 * input, $2/M output — covers the catalog for under $1).
 *
 * `jsonMode: "json_schema"` because OpenAI's own models support
 * strict schema-constrained generation. The model literally can't
 * produce tokens that would violate the schema.
 */
export const openaiProvider: AIProvider = buildOpenAICompatProvider({
  id: "openai",
  displayName: "OpenAI",
  envVarName: "OPENAI_API_KEY",
  defaultModel: "gpt-5-mini",
  modelEnvVarName: "OPENAI_TRANSLATE_MODEL",
  jsonMode: "json_schema",
});

/**
 * DeepSeek. OpenAI-compatible API — same request/response shape,
 * different baseURL. Default model: `deepseek-chat` (V3-style chat
 * model). Pricing is in the same ballpark as GPT-5-mini.
 *
 * `jsonMode: "json_object"` because DeepSeek's API doesn't
 * implement OpenAI's `json_schema` variant (returns
 * `400 This response_format type is unavailable now` if you try).
 * The simpler `json_object` mode is supported and produces
 * parseable JSON; `isTranslateShape()` validates the shape
 * client-side after parsing. The SYSTEM_PROMPT already asks for
 * the exact shape, so the model returns it reliably in practice.
 */
export const deepseekProvider: AIProvider = buildOpenAICompatProvider({
  id: "deepseek",
  displayName: "DeepSeek",
  envVarName: "DEEPSEEK_API_KEY",
  baseURL: "https://api.deepseek.com",
  defaultModel: "deepseek-chat",
  modelEnvVarName: "DEEPSEEK_TRANSLATE_MODEL",
  jsonMode: "json_object",
});
