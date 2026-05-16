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

/**
 * `@netlify/blobs > getStore()` throws `MissingBlobsEnvironmentError`
 * when neither the implicit Netlify context (`NETLIFY_BLOBS_CONTEXT`)
 * nor the explicit one (`NETLIFY_SITE_ID` + `NETLIFY_BLOBS_TOKEN`) is
 * present. The throw includes a stack trace; logging every request
 * floods stderr with hundreds of identical traces during local /
 * e2e / dev runs where blobs intentionally aren't wired.
 *
 * Detect once at module load (env vars are static for the process)
 * so the per-request hot path is a single boolean check. When blobs
 * aren't configured we return 404 silently — the client treats this
 * the same as "no such media" and falls back to the synthetic
 * cine-loop, matching the broken-image error path.
 */
const BLOBS_AVAILABLE = !!(
  process.env.NETLIFY_BLOBS_CONTEXT ||
  (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN)
);

export async function GET(_req: Request, { params }: Context) {
  const { id } = await params;
  if (!id || id.includes("/") || id.length > 256) {
    return new NextResponse("Bad request", { status: 400 });
  }

  // Fast-path 404 when the blob backend isn't configured (local
  // builds, GitHub Actions e2e, any non-Netlify deployment). The
  // client falls back to the synthetic loop on a failed image
  // load, so this is functionally identical to letting the store
  // throw — but without the stack-trace spam that contends with
  // hydration on slower CI runners.
  if (!BLOBS_AVAILABLE) {
    return new NextResponse("Not found", { status: 404 });
  }

  let blob: Blob | null;
  try {
    blob = await mediaStore().get(id, { type: "blob" });
  } catch (err) {
    // Storage configured but the runtime call still failed (network
    // hiccup, scoped permission, transient). Surface a 500 + log so
    // operators can diagnose; the consumer's broken-image handler
    // already falls back to the synthetic loop.
    console.error("[api/media] blob store error", err);
    return new NextResponse("Storage unavailable", { status: 500 });
  }

  if (!blob) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Always prefer extension-based detection. Netlify Blobs stores
  // every uploaded buffer with `binary/octet-stream` as its `type`
  // (the SDK doesn't expose a way to set the MIME at upload time),
  // so blob.type is never useful. The keys are deterministic
  // (`<id>.<ext>`) and `contentTypeFromKey` handles every format the
  // Twitter import produces; only an unknown extension falls through
  // to the blob's own type as a last resort.
  const fromExt = contentTypeFromKey(id);
  const type = fromExt !== "application/octet-stream" ? fromExt : blob.type || fromExt;

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
