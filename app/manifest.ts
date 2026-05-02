import type { MetadataRoute } from "next";

// PWA manifest. Next.js generates `/manifest.webmanifest` from this
// at build time and links it in <head> automatically.
//
// With Serwist (see `app/sw.ts`) the app is now installable as a
// proper PWA: the catalog shell, the case data, and recently-viewed
// thumbnails are cached for offline use.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Taote POCUS",
    short_name: "Taote POCUS",
    description:
      "Atlas público de POCUS, ECG, casos clínicos e infografías. Contenido educativo en español.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafaf7",
    theme_color: "#fafaf7",
    lang: "es",
    orientation: "portrait-primary",
    categories: ["education", "medical", "reference"],
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        type: "image/png",
        sizes: "180x180",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Atlas POCUS",
        url: "/",
      },
      {
        name: "ECG",
        url: "/ecg",
      },
      {
        name: "Casos clínicos",
        url: "/cases",
      },
      {
        name: "Infografías",
        url: "/info",
      },
    ],
    // Stable identity for the installed PWA. Must be the same origin
    // as the document — using `/` (relative) keeps it portable across
    // dev (localhost), preview deploys, and production. Putting the
    // full SITE_URL here triggered the "id should be same origin"
    // browser warning.
    id: "/",
  };
}
