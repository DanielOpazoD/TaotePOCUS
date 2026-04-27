// Sentry server-side init. Same DSN, narrower surface — Next.js routes
// are static here, so the server work is mostly the build itself plus
// any future API routes / Server Actions.

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
