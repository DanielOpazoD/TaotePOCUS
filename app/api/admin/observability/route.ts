// GET /api/admin/observability — read-only status report on the
// observability stack. Surfaced in the admin AI status badge so an
// admin can answer "is Sentry actually capturing errors in prod?"
// at a glance without checking the Sentry dashboard.
//
// Response shape (stable for the React consumer):
//
//   {
//     "sentry": {
//       "enabled":      boolean,   // IS_SENTRY_ENABLED — DSN non-empty
//       "environment":  string,    // "production" | "staging" | "development"
//       "dsnHostname":  string|null  // host part only (e.g.
//                                    // "o12345.ingest.us.sentry.io"); the
//                                    // public key is stripped to avoid
//                                    // leaking it via the API response
//     },
//     "build": {
//       "nodeEnv":      string,    // process.env.NODE_ENV
//       "commitSha":    string|null  // when CI sets it; otherwise null
//     }
//   }
//
// Auth: admin-only (403). The DSN string itself is NEVER returned —
// only the hostname, so an admin who can see the response knows
// "Sentry is wired to project X" without exposing the full DSN.
//
// Cost: zero — no network call, just a snapshot of env-var state.

import { requireAdmin } from "@/lib/server/session";
import { IS_PRODUCTION, IS_SENTRY_ENABLED, SENTRY_DSN, SENTRY_ENVIRONMENT } from "@/lib/env";

interface ObservabilityStatus {
  sentry: {
    enabled: boolean;
    environment: string;
    /** Hostname extracted from the DSN. Null when DSN is empty OR
     *  unparseable. The public key prefix is stripped — only the
     *  host that the SDK posts events to is returned. */
    dsnHostname: string | null;
  };
  build: {
    nodeEnv: string;
    /** Resolved from `process.env.COMMIT_SHA` (set by Netlify) or
     *  `VERCEL_GIT_COMMIT_SHA`. Null when neither is set (local
     *  dev). */
    commitSha: string | null;
  };
}

function extractSentryHostname(dsn: string): string | null {
  if (!dsn) return null;
  try {
    return new URL(dsn).host || null;
  } catch {
    // Malformed DSN. The SDK would log a warning at init; the
    // admin sees null here as the signal.
    return null;
  }
}

export async function GET(): Promise<Response> {
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const status: ObservabilityStatus = {
    sentry: {
      enabled: IS_SENTRY_ENABLED,
      environment: SENTRY_ENVIRONMENT,
      dsnHostname: extractSentryHostname(SENTRY_DSN),
    },
    build: {
      nodeEnv: process.env.NODE_ENV ?? (IS_PRODUCTION ? "production" : "development"),
      commitSha: process.env.COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
  };

  return Response.json(status);
}
