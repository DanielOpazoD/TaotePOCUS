// POST /api/metrics/report — Real-User-Monitoring beacon ingest.
//
// Anyone can post here (no auth) because every page visit fires
// beacons for the user's web-vitals. The endpoint is intentionally
// small in surface and defensive in validation: an attacker can
// post garbage but can't inflate or distort the dashboard beyond
// the per-payload range we accept.
//
// Storage shape:
//   - One blob per beacon, key = `events/<YYYY-MM-DD>/<timestamp>-<rand>`.
//   - Day-prefixed so the dashboard can list a single day's events
//     by prefix instead of scanning the whole namespace.
//   - Timestamp-then-random prefix gives lexical sort order ~=
//     chronological without us storing a separate index.
//
// Why not append-to-JSONL: read-modify-write under concurrent
// requests would race and silently drop events. Per-event blobs
// trade more keys for write safety, which matters more than read
// speed at our volume (a few hundred events/day at most).
//
// Why not Sentry's RUM: Sentry's performance product exists and
// captures the same metrics, but (a) it's an external dependency
// with a price tag, (b) admin-only requirement is awkward through
// Sentry's permission model, and (c) the dashboard becomes a
// generic Sentry view, not tailored to this app's surfaces.
//
// Response: 204 No Content on success, 4xx on validation error.
// The client never reads the response (sendBeacon is fire-and-
// forget), so we keep replies minimal.

import { metricsStore } from "@/lib/blobs";

/** Allowed metric names — matches `lib/rum.ts:RumBeacon.n` exactly. */
const METRIC_NAMES = new Set(["lcp", "inp", "cls", "fcp", "ttfb"]);
const VIEWPORTS = new Set(["mobile", "tablet", "desktop"]);

/** Hard ceiling on payload size — a valid beacon is ~150 bytes;
 *  rejecting >2KB stops trivial flooding without affecting any
 *  legitimate caller. */
const MAX_PAYLOAD_BYTES = 2048;

interface ValidatedBeacon {
  n: "lcp" | "inp" | "cls" | "fcp" | "ttfb";
  v: number;
  r: string;
  vp: "mobile" | "tablet" | "desktop";
  /** Optional LCP element fingerprint. Only present for `n: "lcp"`
   *  beacons; the client only populates it there. Shape validated
   *  below — each field is independently optional + capped to
   *  prevent injecting arbitrarily-large strings via the public
   *  ingest endpoint. */
  el?: {
    tag: string;
    cls?: string;
    src?: string;
    txt?: string;
    w?: number;
    h?: number;
  };
}

/** Allow-list of HTML tag names we'll accept as LCP element tags.
 *  Rejecting anything else stops an attacker from injecting
 *  arbitrary strings into the dashboard's grouping field. The set
 *  covers every real LCP candidate (images, videos, headings,
 *  block text, common containers). */
const ALLOWED_LCP_TAGS = new Set([
  "IMG",
  "VIDEO",
  "SOURCE",
  "PICTURE",
  "H1",
  "H2",
  "H3",
  "P",
  "DIV",
  "SECTION",
  "ARTICLE",
  "SVG",
  "CANVAS",
  "SPAN",
  "A",
]);

/** Validate the incoming beacon. Returns null if invalid (caller
 *  responds 400). Validation is strict — anything unexpected is a
 *  rejection. */
function validateBeacon(raw: unknown): ValidatedBeacon | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const n = obj.n;
  const v = obj.v;
  const r = obj.r;
  const vp = obj.vp;
  if (typeof n !== "string" || !METRIC_NAMES.has(n)) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  if (typeof r !== "string" || r.length === 0 || r.length > 256) return null;
  if (typeof vp !== "string" || !VIEWPORTS.has(vp)) return null;
  // Sanity range checks. Reject obvious garbage (5+ seconds of CLS
  // is impossible — drift was a Chrome bug at one point that's now
  // fixed). LCP > 60s is also implausible — even a corrupted
  // network shouldn't paint that slowly.
  if (n === "cls" && v > 5) return null;
  if (n !== "cls" && v > 60_000) return null;
  // `r` must be a plausible pathname (starts with /, no embedded
  // newlines, no query / hash — those should be stripped client-
  // side; rejecting here defends against a tampered client).
  if (!r.startsWith("/")) return null;
  if (r.includes("\n") || r.includes("?") || r.includes("#")) return null;

  // Optional `el` field. Only on LCP beacons; tolerated as missing
  // on others (the validator quietly drops it rather than failing,
  // so older / non-LCP clients still round-trip).
  let el: ValidatedBeacon["el"] | undefined;
  if (obj.el && typeof obj.el === "object" && n === "lcp") {
    el = validateLcpElement(obj.el as Record<string, unknown>) ?? undefined;
    // Invalid `el` (wrong shape, unknown tag) → drop the field but
    // still accept the beacon. The value of the metric is the
    // primary signal; element fingerprint is secondary.
  }

  return {
    n: n as ValidatedBeacon["n"],
    v,
    r,
    vp: vp as ValidatedBeacon["vp"],
    ...(el ? { el } : {}),
  };
}

/** Validate the LCP element fingerprint. Strict on tag (must be
 *  in the allow-list); permissive on the optional fields (any
 *  missing field is just skipped). Caps every string length to
 *  defend against a tampered client trying to inflate storage. */
function validateLcpElement(
  raw: Record<string, unknown>,
): NonNullable<ValidatedBeacon["el"]> | null {
  const tag = raw.tag;
  if (typeof tag !== "string" || !ALLOWED_LCP_TAGS.has(tag)) return null;
  const out: NonNullable<ValidatedBeacon["el"]> = { tag };
  if (typeof raw.cls === "string" && raw.cls.length > 0 && raw.cls.length <= 30) {
    // Class names: lowercased alphanum + dashes + underscores only.
    // Strips any "weird" character to keep the aggregation column
    // legible.
    out.cls = raw.cls.replace(/[^a-z0-9_-]/g, "").slice(0, 30) || undefined;
  }
  if (typeof raw.src === "string" && raw.src.length > 0 && raw.src.length <= 256) {
    // Must be a relative or absolute pathname — reject anything
    // that smells like cross-origin tracking (URLs to other sites).
    if (raw.src.startsWith("/") && !raw.src.includes("\n")) {
      out.src = raw.src.slice(0, 256);
    }
  }
  if (typeof raw.txt === "string" && raw.txt.length > 0 && raw.txt.length <= 60) {
    // Strip newlines + cap to 40 chars (server side enforces a hard
    // ceiling slightly above the client's 40 to allow for the rare
    // edge where the client over-captured a UTF-8 boundary).
    out.txt = raw.txt.replace(/[\n\r\t]+/g, " ").slice(0, 40);
  }
  if (typeof raw.w === "number" && Number.isFinite(raw.w) && raw.w >= 0 && raw.w < 10_000) {
    out.w = Math.round(raw.w);
  }
  if (typeof raw.h === "number" && Number.isFinite(raw.h) && raw.h >= 0 && raw.h < 10_000) {
    out.h = Math.round(raw.h);
  }
  return out;
}

/** Compose the storage key. Day prefix + timestamp + random tail
 *  guarantees uniqueness and groups by day for prefix listing. */
function makeKey(): string {
  const now = new Date();
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD
  // Pad timestamp width so the lexical order matches chronological
  // order within the day. crypto.randomUUID is available in modern
  // Node + edge runtimes; fall through to Math.random for safety.
  const ts = now.getTime().toString().padStart(13, "0");
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `events/${day}/${ts}-${rand}`;
}

export async function POST(request: Request): Promise<Response> {
  // Cheap content-length check before parsing — avoids reading a
  // megabyte of garbage just to reject it.
  const lenHeader = request.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_PAYLOAD_BYTES) {
    return new Response(null, { status: 413 });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const beacon = validateBeacon(raw);
  if (!beacon) return new Response(null, { status: 400 });

  // Server-stamp the timestamp. Client-side timestamps were avoided
  // for privacy (no hint of session boundaries) AND correctness
  // (skewed clocks would muddle per-day aggregation).
  const stamped = { ...beacon, t: Date.now() };

  // Best-effort write. If Blobs is misconfigured (local dev without
  // `netlify dev`, or env vars missing) we accept the beacon and
  // drop it — the user shouldn't see beacon errors, and dropping a
  // metric event is preferable to leaking config errors to clients.
  try {
    const store = metricsStore();
    await store.setJSON(makeKey(), stamped);
  } catch {
    // Swallow. The endpoint still returns 204 so the client doesn't
    // retry the beacon (no-op success on the client side).
  }
  return new Response(null, { status: 204 });
}

// GET is intentionally absent — this endpoint is write-only from
// the client. Aggregation reads live on the admin route
// (`/api/admin/metrics`) so the public surface stays minimal.
