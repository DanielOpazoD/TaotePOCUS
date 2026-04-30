"use client";

import { useSeedCases } from "@/hooks/useSeedCases";

/**
 * Editorial footer / colophon. A short mono strip at the bottom of
 * the page that names the typefaces, the corpus size, and a build
 * stamp — magazine inside-cover language, applied to a website.
 *
 * Kept deliberately short (one row, hairline above) so it reads as
 * a craftsperson's signature, not as a marketing footer.
 *
 * The build date is a compile-time constant injected during the
 * Next.js build via process.env.NEXT_PUBLIC_BUILD_DATE if available,
 * falling back to the current date — good enough for a static site
 * regenerated on each deploy.
 *
 * The corpus count comes from the lazy seed-cases chunk; on the
 * very first paint (chunk not yet loaded) the count shows just
 * `extraCases`, then refines once the chunk arrives a few ms later.
 * The footer is below the fold — the user almost never sees the
 * intermediate value.
 */
export default function Footer({ extraCases = 0 }: { extraCases?: number }) {
  const { seed } = useSeedCases();
  const total = seed.length + extraCases;
  const buildDate = formatBuildDate();
  const year = new Date().getFullYear();

  return (
    <footer className="page-footer" role="contentinfo">
      <div className="page-footer-inner">
        <p className="colophon">
          <span>
            Compuesto en <em>Newsreader</em>, IBM Plex Sans y IBM Plex Mono.
          </span>
          <span className="colophon-sep" aria-hidden="true">
            ·
          </span>
          <span className="tnum">{total} casos publicados</span>
          <span className="colophon-sep" aria-hidden="true">
            ·
          </span>
          <span className="tnum">Actualizado {buildDate}</span>
        </p>
        <p className="colophon-mark">
          <span>© {year} Taote POCUS</span>
          <span className="colophon-sep" aria-hidden="true">
            ·
          </span>
          <span>Hecho con cuidado en Rapa Nui</span>
        </p>
      </div>
    </footer>
  );
}

/** Format today's date as "28 abr 2026". */
function formatBuildDate(): string {
  const env = process.env["NEXT_PUBLIC_BUILD_DATE"];
  const d = env ? new Date(env) : new Date();
  if (Number.isNaN(d.getTime())) return "—";
  const months = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  return `${d.getDate()} ${months[d.getMonth()] ?? ""} ${d.getFullYear()}`;
}
