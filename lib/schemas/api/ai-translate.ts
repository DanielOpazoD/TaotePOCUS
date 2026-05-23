// =================== /api/admin/ai/translate CONTRACT ===================
//
// POST — proxy translation request to the selected AI provider.
//
// This route's pre-zod hand-rolled validators (90 lines:
// `validateLocalizedContent` + `validateRequest` + `validateProviderOutput`)
// were the strongest argument for adopting zod for API contracts.
// Same constraints, ~25 lines, less typing-as-cast noise, parse
// errors carry structured paths the client can surface.
//
// Auth: admin-only.

import { z } from "zod";

/** Shared shape for "a translated case content blob". Used by both
 *  the request's `source` field and the response's `result` field,
 *  and by the per-example `es` / `en` halves in the few-shot list. */
const localizedCaseContentSchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(5000),
    tags: z.array(z.string().min(1).max(80)).max(20),
  })
  .strict();

const providerIdSchema = z.enum(["stub", "gemini", "openai", "deepseek"]);
const directionSchema = z.enum(["es-to-en", "en-to-es"]);

/** Few-shot examples: pairs of ES + EN canonical translations. The
 *  provider uses these as in-context teaching signals. Capped at 5
 *  to keep the prompt under model context windows + cost reasonable. */
const fewShotExampleSchema = z
  .object({
    es: localizedCaseContentSchema,
    en: localizedCaseContentSchema,
  })
  .strict();

export const aiTranslateRequestSchema = z
  .object({
    provider: providerIdSchema,
    direction: directionSchema,
    source: localizedCaseContentSchema,
    fewShotExamples: z.array(fewShotExampleSchema).max(5).optional(),
  })
  .strict();

/** Server-side metadata about the provider call. The client surfaces
 *  `provider` + `durationMs` in the diff toolbar so admins can see
 *  "which provider produced this" without opening dev tools. */
const aiCallMetaSchema = z
  .object({
    provider: providerIdSchema,
    model: z.string().min(1),
    // `null` when the provider doesn't report token usage (e.g. the
    // stub provider, or a real provider that hasn't enabled usage
    // headers). Matches `AICallMeta` in `lib/ai/provider.ts`.
    promptTokens: z.number().int().nonnegative().nullable(),
    completionTokens: z.number().int().nonnegative().nullable(),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

export const aiTranslateResponseSchema = z
  .object({
    result: localizedCaseContentSchema,
    meta: aiCallMetaSchema,
  })
  .strict();

export type AITranslateRequest = z.infer<typeof aiTranslateRequestSchema>;
export type AITranslateResponse = z.infer<typeof aiTranslateResponseSchema>;
