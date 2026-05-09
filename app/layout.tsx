import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import "./globals.css";
import { IS_CLERK_ENABLED } from "@/lib/env";

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
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{body}</body>
    </html>
  );
}
