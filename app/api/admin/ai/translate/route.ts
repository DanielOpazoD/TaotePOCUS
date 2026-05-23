// POST /api/admin/ai/translate — proxy AI translation requests to
// the selected provider.
//
// Request body (validated by `aiTranslateRequestSchema`):
//
//   {
//     "provider": "gemini" | "openai" | "deepseek" | "stub",
//     "direction": "es-to-en" | "en-to-es",
//     "source": { "title": "...", "description": "...", "tags": [...] },
//     "fewShotExamples": [{ "es": {...}, "en": {...} }, ...]   // optional
//   }
//
// Response 200 (validated by `aiTranslateResponseSchema`):
//
//   {
//     "result": { "title": "...", "description": "...", "tags": [...] },
//     "meta":   { "provider": "...", "model": "...",
//                 "promptTokens": 123|null, "completionTokens": 456|null,
//                 "durationMs": 1234 }
//   }
//
// Auth: admin-only.
//
// May-2026: the previous hand-rolled validators (`validateRequest`,
// `validateLocalizedContent`, `validateProviderOutput`) totaled ~90
// lines of repeated typeof checks and string error returns. Replaced
// with zod schemas in `lib/schemas/api/ai-translate.ts` — same
// constraints, less ceremony, structured error paths that the client
// can map to actionable feedback. See `lib/schemas/api/README.md`
// for the broader rationale (zod for API contracts, hand-rolled
// stays for the corpus).

import { requireAdmin } from "@/lib/server/session";
import { getProvider } from "@/lib/ai/registry";
import { ProviderUnavailableError } from "@/lib/ai/provider";
import {
  aiTranslateRequestSchema,
  aiTranslateResponseSchema,
} from "@/lib/schemas/api/ai-translate";
import { log } from "@/lib/log";

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

  const reqParse = aiTranslateRequestSchema.safeParse(body);
  if (!reqParse.success) {
    // First issue's path + message gives the client a precise error
    // location (e.g. "source.title: too small"). The full issue array
    // is too noisy for the wire response but useful in the server log.
    const first = reqParse.error.issues[0];
    const reason = first ? `${first.path.join(".")}: ${first.message}` : "invalid body";
    return Response.json({ error: "Invalid request body", reason }, { status: 400 });
  }
  const validated = reqParse.data;

  const provider = getProvider(validated.provider);
  if (!provider) {
    return Response.json({ error: `Unknown provider id: ${validated.provider}` }, { status: 400 });
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
      source: validated.source,
      direction: validated.direction,
      fewShotExamples: validated.fewShotExamples,
    });

    // Defense in depth: re-validate the provider's output against the
    // same contract the client expects. A stub provider returning a
    // malformed shape (e.g. tags as strings instead of array) gets
    // caught here as a 502 instead of being shipped through.
    const respParse = aiTranslateResponseSchema.safeParse(output);
    if (!respParse.success) {
      const first = respParse.error.issues[0];
      const reason = first ? `${first.path.join(".")}: ${first.message}` : "malformed";
      log.error(
        "ai-translate-provider-output-malformed",
        {
          area: "api/admin/ai/translate",
          provider: validated.provider,
          issues: respParse.error.issues.slice(0, 5),
        },
        respParse.error,
      );
      return Response.json(
        { error: "Provider returned malformed output", reason },
        { status: 502 },
      );
    }
    return Response.json(respParse.data);
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      return Response.json({ error: "Provider unavailable", reason: err.reason }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Provider call failed", message }, { status: 502 });
  }
}
