import type { MetadataRoute } from "next";
import { SECTIONS } from "@/lib/data";
import { loadSeedCasesServer } from "@/lib/seed-cases.server";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Async because the corpus lives at `public/data/imported-cases.json`
// and is read off disk via `loadSeedCasesServer` (see Bloque O). Next
// runs `sitemap()` at build time on the server, so the file read is
// essentially synchronous — no observable delay in `next build`
// output.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const sections = SECTIONS.map((s) => ({
    // Atlas lives at /; the others at /<section>.
    url: s.id === "atlas" ? SITE_URL : `${SITE_URL}/${s.id}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: s.id === "atlas" ? 1.0 : 0.8,
  }));
  const seedCases = await loadSeedCasesServer();
  const cases = seedCases.map((c) => {
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
