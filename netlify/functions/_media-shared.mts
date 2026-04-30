// Shared helpers for the media-* functions. Centralised so the auth
// gate, store name, and key shape stay in lock-step across upload,
// list, serve, and delete.

import { getStore, getDeployStore } from "@netlify/blobs";
import type { MediaKind } from "../../lib/types";

/** Single Blobs store name. Bump only if you migrate everything. */
export const MEDIA_STORE = "case-media";

/**
 * Mime-type → MediaKind classifier. PDFs / docs collapse to "document";
 * GIFs are surfaced separately because the renderer treats them as
 * autoplay images, not videos.
 */
export function classify(mime: string): MediaKind {
  if (!mime) return "document";
  if (mime === "image/gif") return "gif";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return "document";
}

/** Blob key shape: `<kind>/<timestamp>-<random>.<ext>`. */
export function makeKey(kind: MediaKind, filename: string): string {
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${kind}/${stamp}-${rand}-${safe || "file"}`;
}

/**
 * Resolve the right blob store. In production we want the long-lived
 * site-level store so uploads survive deploys. In preview / local
 * `netlify dev`, the deploy-scoped store is used so contributor work
 * doesn't leak into prod.
 *
 * `deployContext` is `Netlify.context.deploy.context` — pass it through
 * from the function entrypoint so this stays a pure helper.
 */
export function mediaStore(deployContext?: string) {
  if (deployContext === "production") return getStore(MEDIA_STORE);
  try {
    return getDeployStore(MEDIA_STORE);
  } catch {
    // Local dev without a deploy context — fall back to the site store.
    return getStore(MEDIA_STORE);
  }
}

/**
 * Admin gate. Compares `x-admin-token` against `ADMIN_UPLOAD_TOKEN`
 * (server-only) and falls back to `NEXT_PUBLIC_ADMIN_PASSWORD` for
 * parity with the existing client-side admin gate. When neither var is
 * set we allow the call so a fresh `netlify dev` works out of the box;
 * deployments should always set `ADMIN_UPLOAD_TOKEN`.
 */
export function isAdmin(req: Request): boolean {
  const provided = req.headers.get("x-admin-token") || "";
  const required =
    process.env.ADMIN_UPLOAD_TOKEN || process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "";
  if (!required) return true;
  return provided.length > 0 && provided === required;
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
