// Sentry edge-runtime init. Empty unless we add Edge routes later, but
// @sentry/nextjs expects the file to exist when withSentryConfig is in
// use. Kept minimal so it has zero cost in the bundle.

import * as Sentry from "@sentry/nextjs";
import { IS_PRODUCTION, SENTRY_DSN, SENTRY_ENVIRONMENT } from "@/lib/env";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    tracesSampleRate: IS_PRODUCTION ? 0.1 : 1.0,
    enabled: IS_PRODUCTION || SENTRY_ENVIRONMENT === "staging",
  });
}
