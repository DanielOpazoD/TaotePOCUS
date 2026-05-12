// POST /api/admin/ai/translate — proxy AI translation requests to
// the selected provider.
//
// Request body:
//
//   {
//     "provider": "gemini" | "openai" | "deepseek" | "stub",
//     "direction": "es-to-en" | "en-to-es",
//     "source": { "title": "...", "description": "...", "tags": [...] },
//     "fewShotExamples": [{ "es": {...}, "en": {...} }, ...]   // optional
//   }
//
// Response (200):
//
//   {
//     "result": { "title": "...", "description": "...", "tags": [...] },
//     "meta":   { "provider": "...", "model": "...",
//                 "promptTokens": 123, "completionTokens": 456,
//                 "durationMs": 1234 }
//   }
//
// Auth: admin-only. Body validation: hand-rolled (same convention
// as `lib/schemas.ts` — no Zod dep). Provider errors translated to
// structured 5xx so the UI can surface meaningful messages.

import { requireAdmin } from "@/lib/server/session";
import { getProvider } from "@/lib/ai/registry";
import { ProviderUnavailableError } from "@/lib/ai/provider";
import type {
  LocalizedCaseContent,
  ProviderId,
  TranslateInput,
  TranslateOutput,
} from "@/lib/ai/provider";

const VALID_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>([
  "stub",
  "gemini",
  "openai",
  "deepseek",
]);
const VALID_DIRECTIONS: ReadonlySet<TranslateInput["direction"]> = new Set([
  "es-to-en" as const,
  "en-to-es" as const,
]);

/**
 * Hand-rolled validators mirror the philosophy of `lib/schemas.ts`:
 * accept the safe subset, return a clear error string on the
 * rejection path, no extra runtime deps. The strings flow up to the
 * 400 response so a malformed UI request gets actionable feedback.
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
  provider: ProviderId;
  direction: TranslateInput["direction"];
  source: LocalizedCaseContent;
  fewShotExamples?: TranslateInput["fewShotExamples"];
}

function validateRequest(body: unknown): ValidatedRequest | string {
  if (!body || typeof body !== "object") return "Body must be a JSON object";
  const obj = body as Record<string, unknown>;

  if (typeof obj.provider !== "string" || !VALID_PROVIDERS.has(obj.provider as ProviderId)) {
    return `provider must be one of: ${Array.from(VALID_PROVIDERS).join(", ")}`;
  }
  if (typeof obj.direction !== "string" || !VALID_DIRECTIONS.has(obj.direction as never)) {
    return "direction must be 'es-to-en' or 'en-to-es'";
  }
  const source = validateLocalizedContent(obj.source, "source");
  if (typeof source === "string") return source;

  let fewShotExamples: TranslateInput["fewShotExamples"] | undefined;
  if (obj.fewShotExamples !== undefined) {
    if (!Array.isArray(obj.fewShotExamples)) {
      return "fewShotExamples must be an array";
    }
    if (obj.fewShotExamples.length > 5) {
      return "fewShotExamples can have at most 5 entries";
    }
    const examples: NonNullable<TranslateInput["fewShotExamples"]> = [];
    for (let i = 0; i < obj.fewShotExamples.length; i++) {
      const ex = obj.fewShotExamples[i];
      if (!ex || typeof ex !== "object") return `fewShotExamples[${i}] must be an object`;
      const exObj = ex as Record<string, unknown>;
      const es = validateLocalizedContent(exObj.es, `fewShotExamples[${i}].es`);
      if (typeof es === "string") return es;
      const en = validateLocalizedContent(exObj.en, `fewShotExamples[${i}].en`);
      if (typeof en === "string") return en;
      examples.push({ es, en });
    }
    fewShotExamples = examples;
  }

  return {
    provider: obj.provider as ProviderId,
    direction: obj.direction as TranslateInput["direction"],
    source,
    fewShotExamples,
  };
}

/**
 * Defense in depth: re-check the provider's output before returning
 * it to the client. Mirrors the same rules as
 * `validateLocalizedContent` plus the meta envelope.
 */
function validateProviderOutput(output: unknown): TranslateOutput | string {
  if (!output || typeof output !== "object") return "Provider returned non-object";
  const obj = output as Record<string, unknown>;
  const result = validateLocalizedContent(obj.result, "result");
  if (typeof result === "string") return `Provider output malformed: ${result}`;
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
    result,
    meta: {
      provider: metaObj.provider as ProviderId,
      model: metaObj.model,
      promptTokens: metaObj.promptTokens as number | null,
      completionTokens: metaObj.completionTokens as number | null,
      durationMs: metaObj.durationMs,
    },
  };
}

export async function POST(req: Request): Promise<Response> {
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const parsed = validateRequest(body);
  if (typeof parsed === "string") {
    return Response.json({ error: "Invalid request body", reason: parsed }, { status: 400 });
  }

  const provider = getProvider(parsed.provider);
  if (!provider) {
    return Response.json({ error: `Unknown provider id: ${parsed.provider}` }, { status: 400 });
  }

  const availability = provider.isAvailable();
  if (!availability.available) {
    return Response.json(
      { error: "Provider unavailable", reason: availability.reason },
      { status: 503 },
    );
  }

  try {
    const output = await provider.translate({
      source: parsed.source,
      direction: parsed.direction,
      fewShotExamples: parsed.fewShotExamples,
    });

    const validated = validateProviderOutput(output);
    if (typeof validated === "string") {
      return Response.json(
        { error: "Provider returned malformed output", reason: validated },
        { status: 502 },
      );
    }
    return Response.json(validated);
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      return Response.json({ error: "Provider unavailable", reason: err.reason }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Provider call failed", message }, { status: 502 });
  }
}
