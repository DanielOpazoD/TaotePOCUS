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

export async function GET(): Promise<Response> {
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }
  const snapshot = snapshotRegistry();
  return Response.json(snapshot);
}
