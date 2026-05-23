// Contract tests for /api/admin/ai/translate. The pre-zod hand-rolled
// validators had ~90 lines of test surface scattered across the
// route test file; these tests pin the same constraints against the
// shared schema instead.

import { describe, expect, it } from "vitest";
import {
  aiTranslateRequestSchema,
  aiTranslateResponseSchema,
  type AITranslateRequest,
  type AITranslateResponse,
} from "@/lib/schemas/api/ai-translate";

const validRequest: AITranslateRequest = {
  provider: "stub",
  direction: "es-to-en",
  source: {
    title: "Derrame pleural",
    description: "Acumulación de líquido en el espacio pleural.",
    tags: ["pulmonar", "efusión"],
  },
};

const validResponse: AITranslateResponse = {
  result: {
    title: "Pleural effusion",
    description: "Fluid accumulation in the pleural space.",
    tags: ["pulmonary", "effusion"],
  },
  meta: {
    provider: "stub",
    model: "stub-v1",
    promptTokens: 42,
    completionTokens: 21,
    durationMs: 12,
  },
};

describe("aiTranslateRequestSchema", () => {
  it("accepts a minimal request (no fewShotExamples)", () => {
    expect(aiTranslateRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("accepts a request with fewShotExamples", () => {
    const r = aiTranslateRequestSchema.safeParse({
      ...validRequest,
      fewShotExamples: [{ es: validRequest.source, en: validResponse.result }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty title (min 1)", () => {
    const r = aiTranslateRequestSchema.safeParse({
      ...validRequest,
      source: { ...validRequest.source, title: "" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a title over 500 chars", () => {
    const r = aiTranslateRequestSchema.safeParse({
      ...validRequest,
      source: { ...validRequest.source, title: "x".repeat(501) },
    });
    expect(r.success).toBe(false);
  });

  it("rejects more than 5 fewShotExamples", () => {
    const ex = { es: validRequest.source, en: validResponse.result };
    const r = aiTranslateRequestSchema.safeParse({
      ...validRequest,
      fewShotExamples: [ex, ex, ex, ex, ex, ex],
    });
    expect(r.success).toBe(false);
  });

  it("rejects tags array longer than 20", () => {
    const r = aiTranslateRequestSchema.safeParse({
      ...validRequest,
      source: { ...validRequest.source, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) },
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown provider", () => {
    const r = aiTranslateRequestSchema.safeParse({ ...validRequest, provider: "anthropic" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown direction", () => {
    const r = aiTranslateRequestSchema.safeParse({ ...validRequest, direction: "fr-to-es" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict)", () => {
    const r = aiTranslateRequestSchema.safeParse({ ...validRequest, extraField: 1 });
    expect(r.success).toBe(false);
  });
});

describe("aiTranslateResponseSchema", () => {
  it("accepts a well-formed response", () => {
    expect(aiTranslateResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it("accepts null token counts (stub provider doesn't report)", () => {
    const r = aiTranslateResponseSchema.safeParse({
      ...validResponse,
      meta: { ...validResponse.meta, promptTokens: null, completionTokens: null },
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing meta envelope", () => {
    const { meta: _meta, ...rest } = validResponse;
    const r = aiTranslateResponseSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects negative durationMs", () => {
    const r = aiTranslateResponseSchema.safeParse({
      ...validResponse,
      meta: { ...validResponse.meta, durationMs: -1 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-integer token counts", () => {
    const r = aiTranslateResponseSchema.safeParse({
      ...validResponse,
      meta: { ...validResponse.meta, promptTokens: 3.5 },
    });
    expect(r.success).toBe(false);
  });
});
