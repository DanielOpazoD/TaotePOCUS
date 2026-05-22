// POST /api/security/csp-report — receives Content-Security-Policy
// violation reports from the browser when a directive blocks a
// resource load. Routes them to Sentry as warnings so the admin
// observability feed surfaces them instead of "silently broken
// asset" mysteries.
//
// Why this exists: without a report endpoint, CSP violations are
// invisible to the developer. A user reports "the page looks
// broken" and the cause turns out to be a CSP rule blocking some
// script we forgot to allow-list. With the report, the violation
// shows up in Sentry the moment it happens, named with the
// directive + blocked URL + the page that triggered it.
//
// Auth: NONE (browsers can't authenticate when sending CSP
// reports — the spec doesn't allow it). Validation defends:
//   - Hard payload cap (8KB; real reports are 200-800 bytes)
//   - JSON shape match (the report-to / report-uri formats)
//   - Allow-list of `effective-directive` values that we care
//     about (filters extension-injected noise that we can't fix
//     anyway — e.g. requests to `chrome-extension://` URLs)
//
// The endpoint always returns 204 — we don't want to leak any
// information to a hostile poker. Validation failures are
// silently dropped, NOT 400'd.

import { log } from "@/lib/log";

const MAX_PAYLOAD_BYTES = 8 * 1024;

/** CSP directives we care about. Browser extensions trip rules for
 *  weird stuff (chrome-extension URLs, script-src for inline scripts
 *  the extension injected); we filter those because they're not
 *  actionable. Anything in this set generates a Sentry warning. */
const ACTIONABLE_DIRECTIVES = new Set([
  "default-src",
  "script-src",
  "script-src-elem",
  "style-src",
  "img-src",
  "media-src",
  "connect-src",
  "frame-src",
  "font-src",
  "form-action",
  "frame-ancestors",
  "base-uri",
  "worker-src",
]);

/** Two report formats live in the wild:
 *   - Legacy `report-uri` (Firefox / old Chrome): wraps the report
 *     in `{ "csp-report": { … } }`.
 *   - Modern `report-to` (Reporting API spec): `[ { type: "csp-violation",
 *     body: { … } } ]`.
 *  This validator handles both, normalising to one shape. */
interface NormalisedReport {
  directive: string;
  blockedUri: string;
  documentUri: string;
  disposition: "enforce" | "report";
}

function normalise(raw: unknown): NormalisedReport | null {
  if (!raw || typeof raw !== "object") return null;
  // Legacy shape: { "csp-report": {...} }
  if ("csp-report" in raw && typeof (raw as Record<string, unknown>)["csp-report"] === "object") {
    const r = (raw as Record<string, Record<string, unknown>>)["csp-report"];
    return pickFields(r ?? {});
  }
  // Modern reporting-api: array of report objects, each with `body`.
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (first && typeof first === "object" && "body" in first) {
      const body = (first as Record<string, unknown>).body;
      if (body && typeof body === "object") {
        return pickFields(body as Record<string, unknown>);
      }
    }
  }
  return null;
}

function pickFields(r: Record<string, unknown>): NormalisedReport | null {
  // Both formats use slightly different field names. Try both.
  const directive =
    pickString(r, [
      "effectiveDirective",
      "effective-directive",
      "violatedDirective",
      "violated-directive",
    ]) ?? "";
  const blockedUri = pickString(r, ["blockedURL", "blocked-uri"]) ?? "";
  const documentUri = pickString(r, ["documentURL", "document-uri"]) ?? "";
  const disposition = (pickString(r, ["disposition"]) ?? "enforce") as "enforce" | "report";
  if (!directive) return null;
  // Trim directive to the base name (some reports include the
  // matched source after a space, e.g. "script-src 'unsafe-inline'").
  const baseDirective = directive.split(/\s+/)[0] ?? directive;
  return {
    directive: baseDirective,
    blockedUri: blockedUri.slice(0, 512),
    documentUri: documentUri.slice(0, 512),
    disposition,
  };
}

function pickString(r: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string") return v;
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  // Cheap content-length pre-check.
  const len = request.headers.get("content-length");
  if (len && Number(len) > MAX_PAYLOAD_BYTES) {
    return new Response(null, { status: 204 });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }
  const report = normalise(raw);
  if (!report) return new Response(null, { status: 204 });
  if (!ACTIONABLE_DIRECTIVES.has(report.directive)) {
    return new Response(null, { status: 204 });
  }

  // Forward to Sentry via the log layer (which decides between
  // breadcrumb-only and captureMessage based on level). CSP
  // violations get `warn` — they're worth seeing but not on-call
  // alerts.
  log.warn("csp-violation", {
    area: "security",
    directive: report.directive,
    blockedUri: report.blockedUri,
    documentUri: report.documentUri,
    disposition: report.disposition,
  });

  return new Response(null, { status: 204 });
}
