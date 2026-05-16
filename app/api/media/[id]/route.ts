// GET /api/media/<id>
//
// Streams an imported case's media file from Netlify Blobs. The store
// itself has no public-URL surface — every read goes through this
// handler so we control caching, content negotiation, and content-
// type, and so we can swap the underlying storage (S3 / Cloudinary)
// without touching any `<img src>` in the catalog.
//
// Content negotiation: when the request advertises `image/avif` or
// `image/webp` in its `Accept` header AND the optimization script
// (`scripts/optimize-media.mjs`) has generated a sibling variant,
// the route serves the smaller variant instead of the original JPG.
// Modern browsers always do this — typical savings 40-60% per
// thumbnail. The original is still the universal fallback when no
// variant has been generated yet.
//
// Cache strategy: the keys are immutable — once a file is uploaded
// for case `tw-1234`, it never changes. So we ship the strongest
// cache headers (1 year, immutable) and let Netlify's CDN do the
// heavy lifting. `Vary: Accept` is critical so the CDN keeps
// separate cache entries per format — without it, a cached AVIF
// could leak to a browser that only accepts JPG.

import { NextResponse } from "next/server";
import { contentTypeFromKey, mediaStore, pickMediaCandidates } from "@/lib/blobs";

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

export async function GET(req: Request, { params }: Context) {
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

  // Compute the candidate list (best variant first) and walk it
  // until something exists. The order is deterministic per
  // `Accept` header so two browsers that advertise the same
  // formats always get the same answer — friendly to CDN cache.
  const candidates = pickMediaCandidates(id, req.headers.get("Accept"));
  const store = mediaStore();
  let blob: Blob | null = null;
  let matchedKey = id;
  for (const candidate of candidates) {
    try {
      const found = await store.get(candidate, { type: "blob" });
      if (found) {
        blob = found;
        matchedKey = candidate;
        break;
      }
    } catch (err) {
      // Storage configured but the runtime call failed (network
      // hiccup, scoped permission, transient). Surface a 500 +
      // log so operators can diagnose; the consumer's broken-
      // image handler already falls back to the synthetic loop.
      console.error("[api/media] blob store error", err);
      return new NextResponse("Storage unavailable", { status: 500 });
    }
  }

  if (!blob) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Always prefer extension-based detection. Netlify Blobs stores
  // every uploaded buffer with `binary/octet-stream` as its `type`
  // (the SDK doesn't expose a way to set the MIME at upload time),
  // so blob.type is never useful. The MATCHED key (not the requested
  // one) drives the content-type so a variant hit returns its own
  // mime (e.g. `image/avif`), not the original's (`image/jpeg`).
  const fromExt = contentTypeFromKey(matchedKey);
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
      // `Vary: Accept` tells caches (CDN + browser) that the response
      // depends on the request's `Accept` header. Without it, a
      // cached AVIF could be served to a client that only advertised
      // JPG support — a stale-cache leak that breaks image rendering.
      Vary: "Accept",
    },
  });
}
