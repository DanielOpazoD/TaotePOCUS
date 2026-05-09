"use client";

import { Fragment } from "react";
import { useSeedCases } from "@/hooks/useSeedCases";
import { useLanguage } from "@/hooks/useLanguage";

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
  const { t, formatDate } = useLanguage();
  const total = seed.length + extraCases;
  const buildDate = formatDate(buildDateInput());
  const year = new Date().getFullYear();
  // The "composed in" line embeds an italicized "Newsreader" mid-
  // sentence. Splitting on the placeholder lets the dictionary keep
  // the surrounding copy translatable while preserving the <em>
  // typography. Re-using the {newsreader} convention rather than a
  // separate React-only path keeps the dictionary string readable
  // for non-engineer translators.
  const composedTemplate = t("footer.composed");
  const composedParts = composedTemplate.split(/\{newsreader\}/);

  return (
    <footer className="page-footer" role="contentinfo">
      <div className="page-footer-inner">
        <p className="colophon">
          <span>
            {composedParts.map((part, i) => (
              <Fragment key={i}>
                {part}
                {i < composedParts.length - 1 && <em>Newsreader</em>}
              </Fragment>
            ))}
          </span>
          <span className="colophon-sep" aria-hidden="true">
            ·
          </span>
          <span className="tnum">{t("footer.cases", { count: total })}</span>
          <span className="colophon-sep" aria-hidden="true">
            ·
          </span>
          <span className="tnum">{t("footer.updated", { date: buildDate })}</span>
        </p>
        <p className="colophon-mark">
          <span>{t("footer.copyright", { year })}</span>
          <span className="colophon-sep" aria-hidden="true">
            ·
          </span>
          <span>{t("footer.signature")}</span>
        </p>
      </div>
    </footer>
  );
}

/** Resolve the build date input, preferring the env-injected stamp
 *  over a runtime `new Date()` so two clients on the same deploy
 *  agree on what "actualizado" means. Returns `undefined` for an
 *  invalid env value so the formatter renders an em-dash. */
function buildDateInput(): string | Date | undefined {
  const env = process.env["NEXT_PUBLIC_BUILD_DATE"];
  if (!env) return new Date();
  const d = new Date(env);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
