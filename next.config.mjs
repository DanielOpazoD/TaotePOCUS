import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwistInit from "@serwist/next";

// Security headers applied to all routes. Tuned for a public, mostly-
// static educational site — strict CSP, no third-party iframes, deny
// embedding, no MIME sniffing. Hosts allowed in connect-src cover
// Firebase Auth + Firestore + Sentry + Clerk; remove what you don't
// use.
//
// Clerk hosts are needed because the SDK lazy-loads `clerk.browser.js`
// from the instance domain (e.g. `civil-slug-18.clerk.accounts.dev`)
// at first auth interaction, then makes API calls to it for session
// management. Without these entries the script load is silently
// blocked by the browser and `<SignIn />` never mounts, surfacing as
// "Failed to load Clerk JS" in the runtime error overlay.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline' stays for the pre-paint theme script and
      // for Next.js's small inline bootstrappers. Replacing it with
      // nonces would require middleware on EVERY response (kills
      // static optimization on a primarily-static site). Tightened
      // by dropping 'unsafe-eval': Next.js prod builds don't need
      // it, our deps (Sentry, Clerk, Firebase, Serwist) don't use
      // eval/new Function() at runtime. Reduces the JIT-injection
      // attack surface without breaking anything.
      [
        "script-src 'self' 'unsafe-inline'",
        // Clerk JS bundles + per-instance subdomains (dev / staging / prod
        // all share the same wildcard).
        "https://*.clerk.com",
        "https://*.clerk.accounts.dev",
        "https://*.clerk.dev",
        // Cloudflare Turnstile is the CAPTCHA Clerk loads on sign-up.
        // Without this entry the Turnstile script is blocked, the
        // captcha token never gets minted, and Clerk's `/sign_ups`
        // endpoint 400s with an empty challenge. See
        // https://clerk.com/docs/security/clerk-csp.
        "https://challenges.cloudflare.com",
      ].join(" "),
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      // Tightened img-src: was `https:` (any HTTPS host). The actual
      // image sources are: same-origin (`/api/media/*`), Clerk avatar
      // CDN (images.clerk.com), Sentry user-feedback screenshots
      // (sentry.io), the Next/Image optimizer (proxies same-origin
      // → so still `self`). Wildcard `https:` allowed images from
      // ANY external host; tightening forces a config update when
      // we want to add a new image source — better than silent
      // image-tag exfiltration of session data.
      [
        "img-src 'self' data: blob:",
        "https://*.clerk.com",
        "https://images.clerk.com",
        "https://*.sentry.io",
      ].join(" "),
      "media-src 'self' data: blob:",
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
        // Clerk REST APIs + telemetry. The instance subdomain
        // (civil-slug-18 in dev, your custom domain in prod) is
        // covered by the wildcard.
        "https://*.clerk.com",
        "https://*.clerk.accounts.dev",
        "https://*.clerk.dev",
        "https://clerk-telemetry.com",
        "https://*.clerk-telemetry.com",
        // Turnstile callbacks (CAPTCHA verification round-trip).
        "https://challenges.cloudflare.com",
      ].join(" "),
      // Clerk renders an iframe for some flows (e.g., the captcha).
      "frame-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com",
      // Clerk uses Web Workers for CAPTCHA challenges.
      "worker-src 'self' blob:",
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
  // Cross-origin isolation: keep the document in its own browsing-
  // context group so a malicious cross-origin opener can't read state.
  // `same-origin-allow-popups` (rather than the stricter
  // `same-origin`) keeps Clerk's SSO popup flow alive — when a user
  // picks Google / GitHub on the sign-in modal, Clerk opens a popup
  // to the IdP and reads the auth result back. The strict variant
  // would null the popup's `window.opener` and break the round-trip.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  // Prevents Spectre-style cross-origin reads. `same-origin` is safe
  // because every asset on the page (chunks, images via /api/media,
  // fonts) is same-origin or has explicit CORS headers from its CDN.
  // Promote to `cross-origin` only if a broken external resource needs
  // it.
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
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
  // Bake build metadata into the bundle. Netlify exposes
  // `COMMIT_REF` + friends ONLY at build time (Functions runtime
  // doesn't see them); we capture them here so `/api/health` and
  // the footer can surface the active deploy without an extra Netlify
  // API round-trip. The vars are read on next build evaluation, so
  // the values are pinned per deploy. Falling back to `null` when
  // unset (local `npm run build`, or a CI without the Netlify env).
  env: {
    COMMIT_REF: process.env.COMMIT_REF || "",
    NEXT_PUBLIC_BUILD_DATE: process.env.NEXT_PUBLIC_BUILD_DATE || new Date().toISOString(),
  },
  // ── Image optimization ──────────────────────────────────────────────
  // Catalog thumbnails are the heaviest payload on first paint —
  // ~330 imported cases each with a multi-MB raw image/video. Going
  // through Next.js's `<Image>` component (paired with Netlify's
  // built-in Image CDN) gets us:
  //
  //   - automatic resize per viewport via `srcSet`
  //   - WebP / AVIF when the browser supports it (~30-50% smaller
  //     than JPEG at equal perceived quality)
  //   - `loading="lazy"` by default so off-screen cards don't block
  //     the network on first paint
  //   - `width` / `height` derived from the aspect-ratio container,
  //     eliminating layout shift
  //
  // The Netlify Next.js plugin auto-routes optimized requests through
  // Netlify's Image CDN (no extra config needed) when this block is
  // present and `unoptimized: false`. In dev (`npm run dev` without
  // `netlify dev`) Next falls back to its built-in optimizer, which
  // is slower but still works.
  images: {
    formats: ["image/avif", "image/webp"],
    // Cases ship media via our `/api/media/[id]` Route Handler. The
    // optimizer needs an explicit allow-pattern even for same-origin
    // dynamic routes — without it `<Image>` with the API path
    // refuses to optimize and the browser falls back to original.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
        pathname: "/api/media/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        pathname: "/api/media/**",
      },
    ],
    // Default device sizes are fine; tightening them a bit since our
    // grid maxes out at 5 cols × 1480px = ~290px per thumb. Removing
    // the 3840 / 2048 tiers saves a couple of `srcSet` entries per
    // image (less HTML byte cost).
    deviceSizes: [320, 480, 640, 750, 828, 1080, 1200, 1920],
  },
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

// Serwist wraps `app/sw.ts` into a compiled `public/sw.js` with the
// build-time precache manifest injected. Disabled in dev so HMR
// doesn't fight the SW intercepting JS chunk requests; production
// builds and `next start` enable it. See `app/sw.ts` for the
// caching strategy + ADR-style header.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Cache navigated pages so revisiting an already-seen route is
  // instant (and works offline).
  cacheOnNavigation: true,
  // Auto-reload open tabs when network comes back, so a user that
  // went offline doesn't get stuck on stale state.
  reloadOnOnline: true,
  // Disable in dev — Turbopack/HMR does its own request handling
  // and the SW caching every JS chunk gets in the way.
  disable: process.env.NODE_ENV === "development",
});

// Wrap with Sentry only when a DSN is present. The wrapper is heavier
// than the plain SDK init (it injects route instrumentation, source-map
// uploads, etc.) so we skip it entirely on dev / demo paths.
const baseConfig = withSerwist(withBundleAnalyzer(nextConfig));

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
