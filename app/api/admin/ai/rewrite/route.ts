// POST /api/admin/ai/rewrite — editorial rewrite + bilingual
// translation in one shot.
//
// Different from `/translate`: this is a content TRANSFORMATION, not
// a language transformation. The AI rewrites the ES source to fit
// editorial conventions (title = visible sonographic diagnosis,
// description = US findings only, omit clinical history) AND
// produces an EN translation of the cleaned ES.
//
// Request body:
//
//   {
//     "provider":   "stub" | "gemini" | "openai" | "deepseek",   // optional, defaults to the resolved default
//     "source":     { "title": "...", "description": "...", "tags": [...] },   // ES content
//     "instruction": "be more concise..."   // optional, ≤ 500 chars, appended to system prompt
//   }
//
// Response (200):
//
//   {
//     "result": {
//       "es": { "title", "description", "tags": [] },
//       "en": { "title", "description", "tags": [] }
//     },
//     "meta": { "provider", "model", "promptTokens", "completionTokens", "durationMs" }
//   }
//
// Auth: admin-only (403 for non-admins). Same gate as the rest of
// `/api/admin/ai/*`.
//
// Cost: a single chat-completion call with structured output.
// On DeepSeek with `deepseek-chat`, ~$0.001-0.002 per case (rough
// estimate at ~1500-3000 tokens combined). Far cheaper than the
// admin's time editing manually.

import { requireAdmin } from "@/lib/server/session";
import { getProvider, resolveDefaultProvider } from "@/lib/ai/registry";
import { ProviderUnavailableError } from "@/lib/ai/provider";
import type {
  LocalizedCaseContent,
  ProviderId,
  RewriteInput,
  RewriteOutput,
} from "@/lib/ai/provider";

const VALID_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>([
  "stub",
  "gemini",
  "openai",
  "deepseek",
]);

const MAX_INSTRUCTION_LENGTH = 500;

/**
 * Hand-rolled validator for the ES source content. Same shape rules
 * as `/translate` — kept duplicated rather than imported because the
 * route handlers are otherwise self-contained, and a future divergence
 * in shape (e.g., the rewrite endpoint accepting longer descriptions)
 * is easier to make when each handler owns its validation.
 */
function validateLocalizedContent(input: unknown, label: string): LocalizedCaseContent | string {
  if (!input || typeof input !== "object") return `${label} must be an object`;
  const obj = input as Record<string, unknown>;
  if (typeof obj.title !== "string" || obj.title.length === 0 || obj.title.length > 500) {
    return `${label}.title must be a string of 1-500 chars`;
  }
  if (
    typeof obj.description !== "string" ||
    obj.description.length === 0 ||
    obj.description.length > 5000
  ) {
    return `${label}.description must be a string of 1-5000 chars`;
  }
  if (
    !Array.isArray(obj.tags) ||
    obj.tags.length > 20 ||
    !obj.tags.every((t) => typeof t === "string" && t.length > 0 && t.length <= 80)
  ) {
    return `${label}.tags must be a string[] (≤20 items, each 1-80 chars)`;
  }
  return { title: obj.title, description: obj.description, tags: obj.tags as string[] };
}

interface ValidatedRequest {
  providerId: ProviderId;
  source: LocalizedCaseContent;
  instruction?: string;
}

function validateRequest(body: unknown): ValidatedRequest | string {
  if (!body || typeof body !== "object") return "Body must be a JSON object";
  const obj = body as Record<string, unknown>;

  // Provider is optional — defaults to the resolved default (typically
  // DeepSeek in production). When supplied, must be one of the known ids.
  let providerId: ProviderId;
  if (obj.provider === undefined) {
    providerId = resolveDefaultProvider().id;
  } else if (typeof obj.provider !== "string" || !VALID_PROVIDERS.has(obj.provider as ProviderId)) {
    return `provider (when supplied) must be one of: ${Array.from(VALID_PROVIDERS).join(", ")}`;
  } else {
    providerId = obj.provider as ProviderId;
  }

  const source = validateLocalizedContent(obj.source, "source");
  if (typeof source === "string") return source;

  let instruction: string | undefined;
  if (obj.instruction !== undefined) {
    if (typeof obj.instruction !== "string") {
      return "instruction must be a string";
    }
    if (obj.instruction.length > MAX_INSTRUCTION_LENGTH) {
      return `instruction must be ≤ ${MAX_INSTRUCTION_LENGTH} chars`;
    }
    const trimmed = obj.instruction.trim();
    if (trimmed.length > 0) instruction = trimmed;
  }

  return { providerId, source, instruction };
}

/**
 * Defense in depth: re-validate the provider's output before returning
 * it to the client. A malformed provider response gets a 502, not a
 * silent corrupted UI.
 */
function validateRewriteOutput(output: unknown): RewriteOutput | string {
  if (!output || typeof output !== "object") return "Provider returned non-object";
  const obj = output as Record<string, unknown>;
  const resultRaw = obj.result;
  if (!resultRaw || typeof resultRaw !== "object") return "Provider output missing result";
  const resultObj = resultRaw as Record<string, unknown>;
  const es = validateLocalizedContent(resultObj.es, "result.es");
  if (typeof es === "string") return `Provider output malformed: ${es}`;
  const en = validateLocalizedContent(resultObj.en, "result.en");
  if (typeof en === "string") return `Provider output malformed: ${en}`;

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
  if (metaObj.promptTokens !== null && typeof metaObj.promptTokens !== "number") {
    return "Provider output meta.promptTokens must be number | null";
  }
  if (metaObj.completionTokens !== null && typeof metaObj.completionTokens !== "number") {
    return "Provider output meta.completionTokens must be number | null";
  }

  return {
    result: { es, en },
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

  const input: RewriteInput = { source: validated.source, instruction: validated.instruction };
  let raw: RewriteOutput;
  try {
    raw = await provider.rewriteCase(input);
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      return Response.json(
        { error: "Provider not available", reason: err.reason },
        { status: 503 },
      );
    }
    // Any other provider-side error (network failure, schema
    // mismatch, etc.) → 502 so the UI knows the upstream broke,
    // and the admin can retry / switch providers.
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Provider call failed", reason: message }, { status: 502 });
  }

  const validatedOutput = validateRewriteOutput(raw);
  if (typeof validatedOutput === "string") {
    return Response.json(
      { error: "Bad provider output", reason: validatedOutput },
      { status: 502 },
    );
  }

  return Response.json(validatedOutput);
}
