// GET /.netlify/functions/media-serve?key=<blob-key>
//
// Streams a stored blob back with its original Content-Type and a
// long-lived cache header (the key embeds a timestamp + random suffix
// so a stable URL always maps to the same bytes).
//
// Public — no auth gate. Files in `case-media` are intended for the
// catalog and are reachable to anyone with the URL by design.

import type { Context } from "@netlify/functions";
import { mediaStore } from "./_media-shared.mts";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) {
    return new Response(JSON.stringify({ error: "missing_key" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const store = mediaStore(context.deploy?.context);
  const result = await store.getWithMetadata(key, { type: "stream" });
  if (!result) {
    return new Response("Not found", { status: 404 });
  }

  const meta = (result.metadata || {}) as Record<string, string>;
  const headers = new Headers();
  headers.set("content-type", meta.contentType || "application/octet-stream");
  // Immutable URLs (key has a timestamp + random) — fine to cache hard.
  headers.set("cache-control", "public, max-age=31536000, immutable");
  if (meta.filename) {
    // `inline` so browsers render it; the filename helps when the user
    // explicitly downloads.
    headers.set(
      "content-disposition",
      `inline; filename="${meta.filename.replace(/"/g, "")}"`,
    );
  }

  return new Response(result.data as ReadableStream, { headers });
};

export const config = {
  path: "/api/media/serve",
};
