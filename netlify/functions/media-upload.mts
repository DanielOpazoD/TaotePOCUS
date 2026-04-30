// POST /.netlify/functions/media-upload
//
// Accepts `multipart/form-data` with a `file` field (and optional
// `name`/`kind`) or a raw body with `x-file-name`/`content-type`
// headers. Stores the bytes in Netlify Blobs and returns the key plus
// a serve URL the form can drop into `media.src`.
//
// Admin only — see `_media-shared.isAdmin`. Caps payloads at
// `MAX_UPLOAD_BYTES` so a malicious client can't exhaust the function
// memory budget.

import type { Context } from "@netlify/functions";
import { classify, isAdmin, makeKey, mediaStore, unauthorized } from "./_media-shared.mts";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_PREFIXES = ["image/", "video/", "audio/", "application/pdf"];
const ALLOWED_EXACT = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

function isAllowedMime(type: string): boolean {
  if (!type) return false;
  if (ALLOWED_EXACT.has(type)) return true;
  return ALLOWED_PREFIXES.some((p) => type.startsWith(p));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (!isAdmin(req)) return unauthorized();

  const contentType = req.headers.get("content-type") || "";
  let bytes: ArrayBuffer;
  let filename: string;
  let mime: string;

  try {
    if (contentType.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return json({ error: "missing_file_field" }, 400);
      }
      bytes = await file.arrayBuffer();
      filename =
        (form.get("name") as string | null) || file.name || `upload-${Date.now()}`;
      mime = file.type || "application/octet-stream";
    } else {
      // Raw body upload — useful for fetch() with a Blob.
      bytes = await req.arrayBuffer();
      filename = req.headers.get("x-file-name") || `upload-${Date.now()}`;
      mime = contentType || "application/octet-stream";
    }
  } catch (err) {
    return json({ error: "invalid_body", detail: String(err) }, 400);
  }

  if (bytes.byteLength === 0) {
    return json({ error: "empty_file" }, 400);
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return json(
      { error: "file_too_large", limit: MAX_UPLOAD_BYTES, size: bytes.byteLength },
      413,
    );
  }
  if (!isAllowedMime(mime)) {
    return json({ error: "unsupported_mime", type: mime }, 415);
  }

  const kind = classify(mime);
  const key = makeKey(kind, filename);
  const store = mediaStore(context.deploy?.context);

  await store.set(key, bytes, {
    metadata: {
      filename,
      contentType: mime,
      size: String(bytes.byteLength),
      kind,
      uploadedAt: new Date().toISOString(),
    },
  });

  return json({
    key,
    url: `/.netlify/functions/media-serve?key=${encodeURIComponent(key)}`,
    kind,
    name: filename,
    type: mime,
    size: bytes.byteLength,
  });
};

export const config = {
  path: "/api/media/upload",
};
