import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";

// PWA manifest. Next.js generates `/manifest.webmanifest` from this
// at build time and links it in <head> automatically.
//
// Keep this minimal — we are not aiming for installability today,
// only for proper iOS / Android home-screen behavior when a user
// adds the site as a shortcut.
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
    // Reference our deployed URL so embedded clients (e.g. browsers
    // installing the PWA) know where to fetch updates from.
    id: SITE_URL,
  };
}
