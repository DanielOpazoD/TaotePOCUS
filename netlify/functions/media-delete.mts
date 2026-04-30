// POST /.netlify/functions/media-delete
//
// Removes a blob by key. Admin only. Body shape: `{ "key": "image/..." }`.
// Idempotent — deleting a non-existent key returns 200 with `{ ok: true }`.

import type { Context } from "@netlify/functions";
import { isAdmin, mediaStore, unauthorized } from "./_media-shared.mts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (!isAdmin(req)) return unauthorized();

  let key: string | null = null;
  try {
    const url = new URL(req.url);
    key = url.searchParams.get("key");
    if (!key) {
      const body = (await req.json().catch(() => ({}))) as { key?: string };
      key = body.key || null;
    }
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  if (!key) return json({ error: "missing_key" }, 400);

  const store = mediaStore(context.deploy?.context);
  await store.delete(key);
  return json({ ok: true, key });
};

export const config = {
  path: "/api/media/delete",
};
