import type { MetadataRoute } from "next";
import { SECTIONS, SEED_CASES } from "@/lib/data";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const sections = SECTIONS.map((s) => ({
    // Atlas lives at /; the others at /<section>.
    url: s.id === "atlas" ? SITE_URL : `${SITE_URL}/${s.id}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: s.id === "atlas" ? 1.0 : 0.8,
  }));
  const cases = SEED_CASES.map((c) => {
    const section = c.section === "atlas" ? "" : `/${c.section}`;
    return {
      url: `${SITE_URL}${section}?caso=${c.id}`,
      lastModified: c.date ? new Date(c.date) : lastModified,
      changeFrequency: "monthly" as const,
      priority: c.featured ? 0.7 : 0.5,
    };
  });
  return [...sections, ...cases];
}
