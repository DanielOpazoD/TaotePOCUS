import type { Metadata } from "next";
import { SITE_URL } from "./env";

interface RouteMeta {
  /** Page-specific title (will be templated by root layout). */
  title: string;
  /** One-line description (~160 chars max for SEO). */
  description: string;
  /** Canonical path for this route. */
  path: string;
  /** Set to true for personal / admin views (`noindex, nofollow`). */
  noindex?: boolean;
}

/**
 * Build a `Metadata` object for a route. Centralizes the OpenGraph and
 * canonical wiring so each page only declares what's specific to it
 * (title, description, path) — repeating boilerplate would let routes
 * drift apart on SEO details.
 */
export function pageMetadata({ title, description, path, noindex }: RouteMeta): Metadata {
  const canonical = path === "/" ? SITE_URL : `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} · Taote POCUS`,
      description,
      url: canonical,
      type: "website",
      locale: "es_CL",
      siteName: "Taote POCUS",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · Taote POCUS`,
      description,
    },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
