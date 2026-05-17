// POST /api/admin/ai/health — health check for the AI provider.
//
// What this does: makes ONE real round-trip to the configured AI
// provider (resolved via `resolveDefaultProvider` or the optional
// `providerId` body param) using a trivial translation payload. The
// goal is to give the admin a yes/no answer to "am I actually
// connected?" — not "is the env var set" (which the existing
// `/providers` endpoint already covers).
//
// Request body (all fields optional):
//
//   { "providerId"?: "stub" | "gemini" | "openai" | "deepseek" }
//
//   When omitted, the resolved default provider is used.
//
// Response (200, always):
//
//   Success:
//     {
//       "providerId":   "deepseek",
//       "providerName": "DeepSeek",
//       "ok":           true,
//       "latencyMs":    742,
//       "model":        "deepseek-chat",
//       "checkedAt":    "2026-05-17T03:42:12.345Z"
//     }
//
//   Failure (still HTTP 200 — the request itself succeeded, the
//   provider call failed; the UI surfaces the error to the admin):
//     {
//       "providerId":   "deepseek",
//       "providerName": "DeepSeek",
//       "ok":           false,
//       "error":        "Invalid API key" | "Network timeout" | "...",
//       "checkedAt":    "2026-05-17T03:42:12.345Z"
//     }
//
// Auth: admin-only (403 for non-admins). Same gate as the rest of
// `/api/admin/ai/*`.
//
// Cost: a single translation request with a 2-word payload. On
// DeepSeek that's < $0.0001 per ping. Trivially cheap, but ONLY
// fired on-demand (the admin clicking "Probar conexión"), not on
// every page load.
//
// Why reuse `translate` instead of adding a dedicated `healthCheck`
// method to the provider interface: the full translate path exercises
// auth + network + the JSON-schema response validator. A trivial
// "GET /models" ping would pass even when the model is mis-configured
// (e.g., DEEPSEEK_TRANSLATE_MODEL points at a model the account
// doesn't have access to). The full path is the user's actual
// experience — a green ping here means the admin's next "Translate"
// click will also work.

import { requireAdmin } from "@/lib/server/session";
import { getProvider, resolveDefaultProvider } from "@/lib/ai/registry";
import { ProviderUnavailableError, type ProviderId } from "@/lib/ai/provider";

const VALID_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>([
  "stub",
  "gemini",
  "openai",
  "deepseek",
]);

interface HealthResponseOk {
  providerId: ProviderId;
  providerName: string;
  ok: true;
  latencyMs: number;
  model: string;
  checkedAt: string;
}

interface HealthResponseFail {
  providerId: ProviderId;
  providerName: string;
  ok: false;
  error: string;
  checkedAt: string;
}

type HealthResponse = HealthResponseOk | HealthResponseFail;

export async function POST(request: Request): Promise<Response> {
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  // Parse optional body. Treat empty / malformed as "use default".
  let body: { providerId?: unknown } = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        body = parsed as { providerId?: unknown };
      }
    }
  } catch {
    // Malformed JSON → fall through to default provider. No 400
    // because the body is optional anyway.
  }

  // Resolve target provider: explicit id from body, else the default.
  let providerId: ProviderId;
  if (typeof body.providerId === "string") {
    if (!VALID_PROVIDERS.has(body.providerId as ProviderId)) {
      return Response.json({ error: `Unknown providerId "${body.providerId}"` }, { status: 400 });
    }
    providerId = body.providerId as ProviderId;
  } else {
    providerId = resolveDefaultProvider().id;
  }

  const provider = getProvider(providerId);
  if (!provider) {
    // Defensive — VALID_PROVIDERS includes every id in the registry,
    // but a future code edit could drift. Return 500 because this is
    // a programmer error, not user input.
    return Response.json({ error: `Provider "${providerId}" not in registry` }, { status: 500 });
  }

  const checkedAt = new Date().toISOString();
  const start = Date.now();
  try {
    const out = await provider.translate({
      // Minimum-viable payload. Two words in title/description, no
      // tags, no few-shot examples. Keeps the API call as cheap as
      // possible while still exercising the full path (prompt
      // construction, network, JSON-schema validation, response
      // parsing).
      source: { title: "hola", description: "prueba de conexión", tags: [] },
      direction: "es-to-en",
    });
    const response: HealthResponseOk = {
      providerId: provider.id,
      providerName: provider.displayName,
      ok: true,
      latencyMs: Date.now() - start,
      model: out.meta.model,
      checkedAt,
    };
    return Response.json(response satisfies HealthResponse);
  } catch (err) {
    // Provider call failed. Don't 5xx — the REQUEST succeeded, we
    // got a structured answer (the provider is down / mis-configured).
    // The UI uses `ok: false` + `error` to render the badge state.
    let message: string;
    if (err instanceof ProviderUnavailableError) {
      message = err.reason;
    } else if (err instanceof Error) {
      message = err.message;
    } else {
      message = String(err);
    }
    const response: HealthResponseFail = {
      providerId: provider.id,
      providerName: provider.displayName,
      ok: false,
      error: message,
      checkedAt,
    };
    return Response.json(response satisfies HealthResponse);
  }
}
