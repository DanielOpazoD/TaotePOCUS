// GET /.netlify/functions/media-list
//
// Returns every blob stored in `case-media` along with its metadata
// (original filename, mime type, size, kind, uploadedAt) so the admin
// UI can render a file browser. Admin only.
//
// Optional query params:
//   - `prefix=image/` — restrict to a single MediaKind subfolder
//   - `limit=100` — cap entries per page

import type { Context } from "@netlify/functions";
import { isAdmin, mediaStore, unauthorized } from "./_media-shared.mts";

interface FileEntry {
  key: string;
  url: string;
  kind: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  etag?: string;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }
  if (!isAdmin(req)) return unauthorized();

  const url = new URL(req.url);
  const prefix = url.searchParams.get("prefix") || undefined;
  const limit = Number(url.searchParams.get("limit") || "0") || undefined;

  const store = mediaStore(context.deploy?.context);
  const { blobs } = await store.list(prefix ? { prefix } : {});
  const slice = limit ? blobs.slice(0, limit) : blobs;

  // Pull metadata in parallel — `list()` only returns key + etag, so
  // a second roundtrip is needed for the file browser fields.
  const entries: FileEntry[] = await Promise.all(
    slice.map(async (b) => {
      const meta = (await store.getMetadata(b.key))?.metadata || {};
      return {
        key: b.key,
        url: `/.netlify/functions/media-serve?key=${encodeURIComponent(b.key)}`,
        kind: (meta.kind as string) || "document",
        name: (meta.filename as string) || b.key,
        type: (meta.contentType as string) || "application/octet-stream",
        size: Number(meta.size) || 0,
        uploadedAt: (meta.uploadedAt as string) || "",
        etag: b.etag,
      };
    }),
  );

  return new Response(JSON.stringify({ files: entries, total: entries.length }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

export const config = {
  path: "/api/media/list",
};
