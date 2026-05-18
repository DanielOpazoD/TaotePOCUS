// POST /api/admin/ai/autotag — "tags only" operation. Lighter than
// the full editorial rewrite — reads the existing title +
// description (assumed already in editorial shape) and produces
// 1-3 idiomatic clinical tags in each language.
//
// Use case: an admin already wrote a clean case description but
// never filled the tags slot, or imported a case that has good
// prose but empty tags. Running the full rewrite would risk
// changing the title/description (which the admin already
// approved); this endpoint touches only the tag slots.
//
// Request body:
//
//   {
//     "provider":  "stub" | "gemini" | "openai" | "deepseek",   // optional
//     "source":    { "title": "...", "description": "..." }
//   }
//
// Response (200):
//
//   {
//     "result": { "es": [...], "en": [...] },
//     "meta":   { provider, model, promptTokens, completionTokens, durationMs }
//   }
//
// Auth: admin-only (403). Cost: ~$0.0005 USD per call on DeepSeek
// (about a third of the full rewrite — smaller prompt + smaller
// response).

import { requireAdmin } from "@/lib/server/session";
import { getProvider, resolveDefaultProvider } from "@/lib/ai/registry";
import { ProviderUnavailableError } from "@/lib/ai/provider";
import type { AutoTagInput, AutoTagOutput, ProviderId } from "@/lib/ai/provider";

const VALID_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>([
  "stub",
  "gemini",
  "openai",
  "deepseek",
]);

interface ValidatedRequest {
  providerId: ProviderId;
  source: AutoTagInput["source"];
}

function validateRequest(body: unknown): ValidatedRequest | string {
  if (!body || typeof body !== "object") return "Body must be a JSON object";
  const obj = body as Record<string, unknown>;

  let providerId: ProviderId;
  if (obj.provider === undefined) {
    providerId = resolveDefaultProvider().id;
  } else if (typeof obj.provider !== "string" || !VALID_PROVIDERS.has(obj.provider as ProviderId)) {
    return `provider (when supplied) must be one of: ${Array.from(VALID_PROVIDERS).join(", ")}`;
  } else {
    providerId = obj.provider as ProviderId;
  }

  if (!obj.source || typeof obj.source !== "object") {
    return "source must be an object with title + description";
  }
  const src = obj.source as Record<string, unknown>;
  if (typeof src.title !== "string" || src.title.length === 0 || src.title.length > 500) {
    return "source.title must be a string of 1-500 chars";
  }
  if (
    typeof src.description !== "string" ||
    src.description.length === 0 ||
    src.description.length > 5000
  ) {
    return "source.description must be a string of 1-5000 chars";
  }

  return {
    providerId,
    source: { title: src.title, description: src.description },
  };
}

function validateOutput(output: unknown): AutoTagOutput | string {
  if (!output || typeof output !== "object") return "Provider returned non-object";
  const obj = output as Record<string, unknown>;
  const resultRaw = obj.result;
  if (!resultRaw || typeof resultRaw !== "object") return "Provider output missing result";
  const resultObj = resultRaw as Record<string, unknown>;
  if (
    !Array.isArray(resultObj.es) ||
    !resultObj.es.every((t) => typeof t === "string" && t.length > 0 && t.length <= 80)
  ) {
    return "result.es must be a string[] of valid tags";
  }
  if (
    !Array.isArray(resultObj.en) ||
    !resultObj.en.every((t) => typeof t === "string" && t.length > 0 && t.length <= 80)
  ) {
    return "result.en must be a string[] of valid tags";
  }
  // Enforce the 1-3 contract on the route boundary too. The provider
  // clamps but defense-in-depth keeps the contract honest if a
  // future provider implementation drifts.
  if (resultObj.es.length < 1 || resultObj.es.length > 3) {
    return `result.es must have 1-3 tags (got ${resultObj.es.length})`;
  }
  if (resultObj.en.length < 1 || resultObj.en.length > 3) {
    return `result.en must have 1-3 tags (got ${resultObj.en.length})`;
  }

  const meta = obj.meta;
  if (!meta || typeof meta !== "object") return "Provider output missing meta envelope";
  const metaObj = meta as Record<string, unknown>;
  if (
    typeof metaObj.provider !== "string" ||
    !VALID_PROVIDERS.has(metaObj.provider as ProviderId)
  ) {
    return "Provider output meta.provider invalid";
  }
  if (typeof metaObj.model !== "string") return "Provider output meta.model not a string";
  if (typeof metaObj.durationMs !== "number") return "Provider output meta.durationMs not a number";

  return {
    result: { es: resultObj.es as string[], en: resultObj.en as string[] },
    meta: {
      provider: metaObj.provider as ProviderId,
      model: metaObj.model,
      promptTokens: (metaObj.promptTokens as number | null) ?? null,
      completionTokens: (metaObj.completionTokens as number | null) ?? null,
      durationMs: metaObj.durationMs,
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const validated = validateRequest(body);
  if (typeof validated === "string") {
    return Response.json({ error: "Invalid request", reason: validated }, { status: 400 });
  }

  const provider = getProvider(validated.providerId);
  if (!provider) {
    return Response.json(
      { error: `Provider "${validated.providerId}" not in registry` },
      { status: 500 },
    );
  }

  const availability = provider.isAvailable();
  if (!availability.available) {
    return Response.json(
      { error: "Provider not available", reason: availability.reason },
      { status: 503 },
    );
  }

  let raw: AutoTagOutput;
  try {
    raw = await provider.autoTag({ source: validated.source });
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      return Response.json(
        { error: "Provider not available", reason: err.reason },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Provider call failed", reason: message }, { status: 502 });
  }

  const validatedOutput = validateOutput(raw);
  if (typeof validatedOutput === "string") {
    return Response.json(
      { error: "Bad provider output", reason: validatedOutput },
      { status: 502 },
    );
  }

  return Response.json(validatedOutput);
}
