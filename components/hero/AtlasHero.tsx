"use client";

import { useMemo } from "react";
import { useCountUp } from "@/hooks/useCountUp";
import { shortDayMonth } from "@/lib/relative-date";
import type { CaseRecord } from "@/lib/types";
import type { PageHead } from "@/lib/headers";
import { buildSparkline } from "./sparkline";

interface Props {
  head: PageHead;
  cases: CaseRecord[];
  onOpenCase: (id: string) => void;
}

/**
 * Atlas hero — the landing of `/`. Personality: numerical, atlas-y.
 *
 * - "Categorías" stat with `useCountUp` reveal
 * - "Actualizado" date + sparkline of monthly publication cadence
 * - "Caso destacado" CTA pulling the first featured case
 * - Aurora-mesh radial-gradient backdrop driven by section accent
 *   (declared in CSS, not here)
 *
 * The "Casos" total is intentionally *not* shown — the toolbar below
 * already renders the live filtered count. Showing both would read
 * as a UI mistake.
 */
export default function AtlasHero({ head, cases, onOpenCase }: Props) {
  const stats = useMemo(() => {
    const cats = new Set(cases.map((c) => c.category)).size;
    const lastDate = cases.reduce<string>((acc, c) => (c.date > acc ? c.date : acc), "");
    return { cats, lastDate: lastDate ? shortDayMonth(lastDate) : "—" };
  }, [cases]);

  // Monthly publication cadence over the last 6 months — rendered as
  // a tiny sparkline alongside "Actualizado". Datos como decoración
  // legítima: si no publicas, la línea cae.
  const sparkPoints = useMemo(() => buildSparkline(cases, 6), [cases]);

  // Number count-up: stat animates from 0 → target the first time the
  // hero scrolls into view. Snaps to final value under reduced motion.
  const catsCount = useCountUp<HTMLElement>(stats.cats);

  const featured = useMemo<CaseRecord | null>(
    () => cases.find((c) => c.featured) ?? cases[0] ?? null,
    [cases],
  );

  return (
    <header className="hero hero--atlas">
      <div className="hero-text">
        <div className="crumb">
          <span>Taote POCUS</span>
          <span className="crumb-dot" />
          <span>{head.crumb}</span>
        </div>
        <h1>{head.title}</h1>
        <p>{head.sub}</p>
        <dl className="hero-stats" aria-label="Resumen de la sección">
          <div>
            <dt>Categorías</dt>
            <dd ref={catsCount.ref}>{catsCount.value}</dd>
          </div>
          <div>
            <dt>Actualizado</dt>
            <dd className="hero-stat-with-spark">
              <span>{stats.lastDate}</span>
              {sparkPoints && (
                <svg
                  className="hero-sparkline"
                  viewBox="0 0 60 16"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Cadencia de publicaciones, últimos 6 meses"
                >
                  <polyline points={sparkPoints} fill="none" />
                </svg>
              )}
            </dd>
          </div>
        </dl>
      </div>
      {featured && (
        <button
          type="button"
          className="hero-cta"
          onClick={() => onOpenCase(featured.id)}
          aria-label={`Abrir caso destacado: ${featured.title}`}
        >
          <span className="hero-cta-eyebrow">Caso destacado</span>
          <span className="hero-cta-title">{featured.title}</span>
          <span className="hero-cta-arrow" aria-hidden="true">
            →
          </span>
        </button>
      )}
    </header>
  );
}
