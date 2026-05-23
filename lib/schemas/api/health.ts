// =================== /api/health CONTRACT ===================
//
// Liveness + readiness probe. Two flavors:
//   GET /api/health          — cheap, build metadata + flag per dep
//   GET /api/health?deep=1   — round-trips every dependency
//
// Both return the same shape. `ok: false` flips when any check fails;
// the response status is 503 in that case so external monitors
// (Netlify Uptime, Pingdom, etc.) trip immediately on partial outage.
//
// Stability: this shape is hit by external uptime monitors, so the
// fields are part of the public contract. Any change here is a
// breaking change for those consumers — add fields freely, but
// don't remove or rename.

import { z } from "zod";

/** Single dependency check result. `latencyMs` only set on the deep
 *  variant or on a probe that actually round-tripped. `error` only
 *  set when `ok === false`. */
const checkResultSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});

export const healthResponseSchema = z
  .object({
    ok: z.boolean(),
    build: z.object({
      // null when the build didn't have COMMIT_REF / NEXT_PUBLIC_BUILD_DATE
      // injected (local dev, manual deploy). External monitors should
      // tolerate the null — they're informational, not gating.
      commit: z.string().nullable(),
      deployedAt: z.string().nullable(),
    }),
    checks: z.object({
      db: checkResultSchema,
      blobs: checkResultSchema,
    }),
    ts: z.string().datetime(),
  })
  .strict();

/** Inferred TS type. Client imports this via `import type` only;
 *  the runtime schema stays server-side. */
export type HealthResponse = z.infer<typeof healthResponseSchema>;
