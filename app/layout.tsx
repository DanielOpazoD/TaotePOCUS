import type { Metadata, Viewport } from "next";
import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import "./globals.css";
import { IS_CLERK_ENABLED } from "@/lib/env";
import { RumInit } from "@/components/chrome/RumInit";
import { PreferencesEffect } from "@/components/chrome/PreferencesEffect";

// Self-hosted Google Fonts via `next/font` — replaces the legacy
// `<link rel="stylesheet" href="https://fonts.googleapis.com/...">`
// that produced render-blocking 3rd-party requests + font-swap CLS.
//
// `display: "swap"` is the right balance here. The original PR (#27)
// shipped `display: "optional"` aiming to kill CLS entirely — but on
// users with cold cache + slow networks, the threshold (~100ms) is
// missed and the page sticks with the fallback (Times New Roman /
// system) for the WHOLE session. Visually unacceptable for an
// editorial-typography product like this — the user reported it
// looking "ugly like Times New Roman". `swap` always loads the real
// font; the CLS risk it reintroduces is small because next/font's
// built-in `size-adjust` metrics make the fallback's character box
// match the real font's box, so the swap moment barely shifts layout.
//
// Each font exports a `.variable` CSS class that sets a custom
// property; `tokens.css` references those props in `--serif` /
// `--sans` / `--mono` so every `font-family` declaration in the app
// flows through these.
// Newsreader is loaded WITHOUT explicit `weight` so we get the full
// variable font (wght 200-800 + opsz 6-72). `tokens.css` drives the
// optical-size axis via `font-variation-settings` per heading rank
// (`--serif-display`, `--serif-h1`, …); a fixed weight array would
// turn this into static subsets and the opsz axis would no longer
// resolve.
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-newsreader",
});
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex-sans",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-plex-mono",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Taote POCUS — Casos clínicos ecográficos",
    template: "%s · Taote POCUS",
  },
  description:
    "Atlas público de POCUS, ECG, casos clínicos e infografías. Contenido educativo en español para residentes y especialistas.",
  applicationName: "Taote POCUS",
  authors: [{ name: "Taote POCUS" }],
  generator: "Next.js",
  keywords: [
    "POCUS",
    "ecografía",
    "ultrasonido",
    "ECG",
    "casos clínicos",
    "infografías médicas",
    "educación médica",
    "atlas",
  ],
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "Taote POCUS",
    title: "Taote POCUS — Casos clínicos ecográficos",
    description:
      "Atlas público de POCUS, ECG, casos clínicos e infografías. Contenido educativo en español.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Taote POCUS",
    description: "Atlas público de POCUS, ECG, casos clínicos e infografías.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1013" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Pre-paint theme + language script — avoids the light→dark flash
  // and a same-paint `<html lang>` mismatch by setting both on
  // <html> before React hydrates. The literal `pocus_theme` /
  // `pocus_lang` keys here are canonically `STORAGE_KEYS.theme` /
  // `STORAGE_KEYS.lang` from `lib/storage-keys.ts`; they can't be
  // imported because this script runs in the browser before any
  // module loads. Keep both spellings aligned if those keys are
  // ever renamed.
  //
  // Language resolution order matches `useLanguage`'s policy:
  //   1. URL query `?lang=es|en`
  //   2. localStorage `pocus_lang`
  //   3. `navigator.language` primary subtag
  //   4. fallback "es"
  const themeScript = `
    (function () {
      try {
        var stored = localStorage.getItem('pocus_theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var theme = stored || (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {}
      try {
        var fromUrl = null;
        try {
          fromUrl = new URLSearchParams(window.location.search).get('lang');
        } catch (e) {}
        var fromStorage = localStorage.getItem('pocus_lang');
        var browser = (navigator.language || 'es').toLowerCase().split(/[-_]/)[0];
        var lang =
          (fromUrl === 'es' || fromUrl === 'en') ? fromUrl :
          (fromStorage === 'es' || fromStorage === 'en') ? fromStorage :
          (browser === 'en') ? 'en' : 'es';
        document.documentElement.lang = lang;
      } catch (e) {}
    })();
  `;
  // ClerkProvider lives INSIDE <body> per Clerk's Next.js Quickstart
  // (the older "wrap <html>" pattern was deprecated in Clerk v6). It
  // wraps only when the publishable key is set so that unconfigured
  // environments (CI builds, fresh clones without `.env.local`) don't
  // crash on missing-key — they fall through to the legacy
  // localStorage auth path. Spanish localization is wired here so
  // every Clerk surface (`<SignIn />`, `<UserProfile />`) ships in es
  // by default.
  const body = IS_CLERK_ENABLED ? (
    <ClerkProvider localization={esES}>{children}</ClerkProvider>
  ) : (
    children
  );
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Preload the cases corpus (~165KB JSON) in parallel with
            the JS chunks. The browser-side loader in
            `lib/seed-cases.ts` does a `fetch(CORPUS_PATH, {
            credentials: "omit", cache: "force-cache" })` AFTER the
            React tree mounts and `MainGrid` calls `useSeedCases`.
            Without this hint, the corpus fetch waits behind JS
            download + parse + first render — typically 300-500ms
            of dead time on a cold load. With the preload, the
            response is sitting in the browser's preload cache by
            the time the loader's fetch fires; the request resolves
            from the cache instead of opening a fresh network
            round-trip.
            `as="fetch" crossOrigin="anonymous"` matches the loader's
            credentials-omit mode so the preload + fetch share the
            same cache key (mismatched modes would store TWO copies).
            Subsequent visits hit Serwist's SWR cache and skip the
            network entirely; this hint matters most on first load. */}
        <link
          rel="preload"
          as="fetch"
          href="/data/imported-cases.json"
          type="application/json"
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}>
        {/* Subscribes the browser to Core Web Vitals events and
            beacons them to `/api/metrics/report`. Honors Do Not
            Track. See `lib/rum.ts` for the wire format + privacy
            posture; `components/admin/MetricsPanel.tsx` is where
            an admin reads the aggregated data. */}
        <RumInit />
        {/* Mirrors `usePreferences()` onto `<html>` as data
            attributes so CSS can scope density + reduced-motion
            overrides without prop drilling. Zero DOM contribution.
            See `components/chrome/PreferencesEffect.tsx`. */}
        <PreferencesEffect />
        {body}
      </body>
    </html>
  );
}
