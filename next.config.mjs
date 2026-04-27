import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";

// Security headers applied to all routes. Tuned for a public, mostly-
// static educational site — strict CSP, no third-party iframes, deny
// embedding, no MIME sniffing. Hosts allowed in connect-src cover
// Firebase Auth + Firestore + Sentry; remove what you don't use.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next inlines small chunks at build time; we keep 'unsafe-inline' for
      // styles (CSS-in-JS would otherwise need nonces) and for the tiny
      // pre-paint theme script. Replace with nonces if you tighten this.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob: https:",
      [
        "connect-src 'self'",
        // Firebase
        "https://*.googleapis.com",
        "https://*.firebaseio.com",
        "https://*.firebaseapp.com",
        "wss://*.firebaseio.com",
        // Sentry
        "https://*.sentry.io",
        "https://*.ingest.sentry.io",
      ].join(" "),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // HSTS only after you serve over HTTPS in production. Disabled locally.
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Wrapped with `@next/bundle-analyzer`. Run `npm run analyze` to open
// HTML reports for client + server bundles. The wrapper is a no-op
// unless ANALYZE=true is set, so it costs nothing in normal builds.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Wrap with Sentry only when a DSN is present. The wrapper is heavier
// than the plain SDK init (it injects route instrumentation, source-map
// uploads, etc.) so we skip it entirely on dev / demo paths.
const baseConfig = withBundleAnalyzer(nextConfig);

const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

export default sentryEnabled
  ? withSentryConfig(baseConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // Suppress sourcemap upload errors when the auth token is missing
      // (e.g. on contributor builds). Real prod CI sets SENTRY_AUTH_TOKEN.
      silent: !process.env.SENTRY_AUTH_TOKEN,
      // Don't add the Sentry tunnel route — it requires server config
      // we don't have on a static export.
      tunnelRoute: undefined,
      disableLogger: true,
    })
  : baseConfig;
