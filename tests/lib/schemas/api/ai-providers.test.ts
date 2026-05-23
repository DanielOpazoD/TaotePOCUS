// Contract tests for /api/admin/ai/providers. Pins the discriminated
// union shape of `availability` so a refactor that changes the
// available-vs-unavailable encoding (e.g. flattening `reason` into a
// top-level field) trips here BEFORE the wire breaks.

import { describe, expect, it } from "vitest";
import {
  aiProvidersResponseSchema,
  type AIProvidersResponse,
} from "@/lib/schemas/api/ai-providers";

const goodResponse: AIProvidersResponse = {
  defaultId: "gemini",
  providers: [
    { id: "stub", displayName: "Stub (offline)", availability: { available: true } },
    { id: "gemini", displayName: "Google Gemini", availability: { available: true } },
    {
      id: "openai",
      displayName: "OpenAI",
      availability: { available: false, reason: "OPENAI_API_KEY not set" },
    },
    {
      id: "deepseek",
      displayName: "DeepSeek",
      availability: { available: false, reason: "DEEPSEEK_API_KEY not set" },
    },
  ],
};

describe("aiProvidersResponseSchema", () => {
  it("accepts a snapshot with all four providers", () => {
    const r = aiProvidersResponseSchema.safeParse(goodResponse);
    expect(r.success).toBe(true);
  });

  it("accepts the minimum: one available provider + a default", () => {
    const r = aiProvidersResponseSchema.safeParse({
      defaultId: "stub",
      providers: [{ id: "stub", displayName: "Stub", availability: { available: true } }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown provider ids in defaultId", () => {
    const r = aiProvidersResponseSchema.safeParse({
      ...goodResponse,
      defaultId: "anthropic",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown provider ids in providers[]", () => {
    const r = aiProvidersResponseSchema.safeParse({
      ...goodResponse,
      providers: [
        ...goodResponse.providers,
        { id: "anthropic", displayName: "X", availability: { available: true } },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects available=true entries that include a reason (discriminated union)", () => {
    const r = aiProvidersResponseSchema.safeParse({
      ...goodResponse,
      providers: [
        {
          id: "stub",
          displayName: "Stub",
          // strict union: `reason` is only allowed when available=false
          availability: { available: true, reason: "extra" },
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects available=false entries that omit the reason", () => {
    const r = aiProvidersResponseSchema.safeParse({
      ...goodResponse,
      providers: [
        {
          id: "openai",
          displayName: "OpenAI",
          availability: { available: false }, // missing reason
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty providers array (we always ship at least the stub)", () => {
    const r = aiProvidersResponseSchema.safeParse({
      defaultId: "stub",
      providers: [],
    });
    expect(r.success).toBe(false);
  });
});
