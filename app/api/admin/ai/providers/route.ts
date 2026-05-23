// GET /api/admin/ai/providers — list AI providers and their
// availability. Powers the admin selector modal in the UI: returns
// every provider the app knows about, whether its env-var key is
// set (so the modal can show available + grayed-out entries with a
// helpful tooltip), and which one would be the default for new
// sessions.
//
// Shape (kept stable for the React side that consumes it):
//
//   {
//     "defaultId": "gemini",
//     "providers": [
//       { "id": "gemini",   "displayName": "...", "availability": { "available": true } },
//       { "id": "openai",   "displayName": "...", "availability": { "available": false, "reason": "..." } },
//       { "id": "deepseek", ... },
//       { "id": "stub",     "displayName": "...", "availability": { "available": true } }
//     ]
//   }
//
// Auth: admin-only. Non-admins get 403 — the AI flows are an
// internal editorial tool, never user-facing.

import { requireAdmin } from "@/lib/server/session";
import { snapshotRegistry } from "@/lib/ai/registry";
import { aiProvidersResponseSchema } from "@/lib/schemas/api/ai-providers";
import { log } from "@/lib/log";

export async function GET(): Promise<Response> {
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }
  const snapshot = snapshotRegistry();
  // Validate outgoing shape — see `lib/schemas/api/README.md`. If the
  // registry adds a provider with an unrecognized id (someone forgets
  // to extend the schema's enum), this returns 500 instead of shipping
  // a body the client can't parse.
  const parsed = aiProvidersResponseSchema.safeParse(snapshot);
  if (!parsed.success) {
    log.error(
      "ai-providers-response-shape-drift",
      { area: "api/admin/ai/providers", issues: parsed.error.issues.slice(0, 5) },
      parsed.error,
    );
    return Response.json({ error: "internal-shape-drift" }, { status: 500 });
  }
  return Response.json(parsed.data);
}
