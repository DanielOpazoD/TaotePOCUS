import bundleAnalyzer from "@next/bundle-analyzer";

// Security headers applied to all routes. Tuned for a public, mostly-
// static educational site — strict CSP, no third-party iframes, deny
// embedding, no MIME sniffing. Adjust the connect-src/img-src lists if
// you add Firebase, Cloudinary, analytics, etc.
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
      "connect-src 'self'",
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

export default withBundleAnalyzer(nextConfig);
