// GET /api/media/<id>
//
// Streams an imported case's media file from Netlify Blobs. The store
// itself has no public-URL surface — every read goes through this
// handler so we control caching and the content-type, and so we can
// swap the underlying storage (S3 / Cloudinary) without touching any
// `<img src>` in the catalog.
//
// Cache strategy: the keys are immutable — once a file is uploaded
// for case `tw-1234`, it never changes. So we ship the strongest
// cache headers (1 year, immutable) and let Netlify's CDN do the
// heavy lifting. The handler should be hit at most once per file
// per CDN region per year.

import { NextResponse } from "next/server";
import { contentTypeFromKey, mediaStore } from "@/lib/blobs";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Context) {
  const { id } = await params;
  if (!id || id.includes("/") || id.length > 256) {
    return new NextResponse("Bad request", { status: 400 });
  }

  let blob: Blob | null;
  try {
    blob = await mediaStore().get(id, { type: "blob" });
  } catch (err) {
    // The blob store can fail at runtime if the env isn't wired
    // (e.g. NETLIFY_BLOBS_CONTEXT missing in a non-Netlify deploy).
    // Surface a 500 with no detail so the consumer falls back to its
    // synthetic loop instead of crashing — log via stderr for
    // operators.
    console.error("[api/media] blob store error", err);
    return new NextResponse("Storage unavailable", { status: 500 });
  }

  if (!blob) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Prefer the blob's own type when present (set at upload time);
  // fall back to extension sniffing for blobs uploaded without
  // explicit metadata.
  const type = blob.type || contentTypeFromKey(id);

  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": type,
      // Immutable + 1 year. Netlify's CDN caches this aggressively;
      // a new upload to the same key would be served stale until the
      // CDN entry expires. Acceptable trade because the import
      // pipeline never overwrites — every case has a unique id.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
