import type { Metadata, Viewport } from "next";
import "./globals.css";

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
  // Pre-paint theme script — avoids the light→dark flash by setting
  // data-theme on <html> before React hydrates.
  const themeScript = `
    (function () {
      try {
        var stored = localStorage.getItem('pocus_theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var theme = stored || (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {}
    })();
  `;
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
