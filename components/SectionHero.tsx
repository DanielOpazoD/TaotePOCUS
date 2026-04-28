"use client";

import { useMemo } from "react";
import { CategoryGlyph } from "@/lib/icons";
import { useCountUp } from "@/hooks/useCountUp";
import type { CaseRecord, CategoryId, View } from "@/lib/types";
import type { PageHead } from "@/lib/headers";

interface Props {
  view: View;
  cat: CategoryId | null;
  head: PageHead;
  scopedCases: CaseRecord[];
  onOpenCase: (id: string) => void;
}

/**
 * Section-aware hero that replaces the generic `.section-head`. Each
 * top-level section gets its own personality:
 *
 *  - atlas: stat row + featured-case CTA (numerical, atlas-y)
 *  - ecg:   horizontal trace decoration (waveform metaphor)
 *  - cases: editorial typography with intro paragraph (magazine)
 *  - info:  poster-style geometric backdrop (infographic)
 *
 * For favs/admin and category-narrowed views we fall back to the
 * compact hero — the dramatic decoration would be misleading.
 */
export default function SectionHero({ view, cat, head, scopedCases, onOpenCase }: Props) {
  // Compact fallback. Used by favs / admin / any time a category is
  // active (the category page is a narrowed grid, not a landing).
  const compact = (
    <div className="section-head section-head--compact">
      <div>
        <div className="crumb">
          <span>Taote POCUS</span>
          <span className="crumb-dot" />
          <span>{head.crumb}</span>
          {cat && (
            <span className="crumb-glyph" aria-hidden="true">
              {CategoryGlyph[cat] ?? null}
            </span>
          )}
        </div>
        <h1>{head.title}</h1>
        <p>{head.sub}</p>
      </div>
    </div>
  );

  if (view.kind !== "section" || cat) return compact;

  if (view.kind === "section" && view.section === "atlas") {
    return <AtlasHero head={head} cases={scopedCases} onOpenCase={onOpenCase} />;
  }
  if (view.kind === "section" && view.section === "ecg") {
    return <EcgHero head={head} count={scopedCases.length} />;
  }
  if (view.kind === "section" && view.section === "cases") {
    return <CasesHero head={head} count={scopedCases.length} />;
  }
  if (view.kind === "section" && view.section === "info") {
    return <InfoHero head={head} count={scopedCases.length} />;
  }
  return compact;
}

/* ---------- atlas ---------- */
function AtlasHero({
  head,
  cases,
  onOpenCase,
}: {
  head: PageHead;
  cases: CaseRecord[];
  onOpenCase: (id: string) => void;
}) {
  const stats = useMemo(() => {
    const total = cases.length;
    const cats = new Set(cases.map((c) => c.category)).size;
    const lastDate = cases.reduce<string>((acc, c) => (c.date > acc ? c.date : acc), "");
    return { total, cats, lastDate: lastDate ? formatShortDate(lastDate) : "—" };
  }, [cases]);

  // Monthly publication cadence over the last 6 months — rendered as
  // a tiny sparkline alongside "Actualizado". Datos como decoración
  // legítima: si no publicas, la línea cae.
  const sparkPoints = useMemo(() => buildSparkline(cases, 6), [cases]);

  // Number count-up: stats animate from 0 → target the first time the
  // hero scrolls into view. Vercel / Linear / Stripe pattern — snaps
  // to final value under reduced motion.
  const totalCount = useCountUp<HTMLElement>(stats.total);
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
            <dt>Casos</dt>
            <dd ref={totalCount.ref}>{totalCount.value}</dd>
          </div>
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

/* ---------- ecg ---------- */
function EcgHero({ head, count }: { head: PageHead; count: number }) {
  return (
    <header className="hero hero--ecg">
      <div className="hero-text">
        <div className="crumb">
          <span>Taote POCUS</span>
          <span className="crumb-dot" />
          <span>{head.crumb}</span>
        </div>
        <h1>{head.title}</h1>
        <p>{head.sub}</p>
        <span className="hero-meta">
          <span>{count}</span> trazados publicados
        </span>
      </div>
      <div className="hero-ecg-strip" aria-hidden="true">
        <EcgStrip />
        <EcgStrip variant="b" />
        <EcgStrip variant="c" />
      </div>
    </header>
  );
}

/* A single ECG row, drawn as a polyline. Three variants give the
   three rows enough rhythm variation that they don't look mirrored. */
function EcgStrip({ variant = "a" }: { variant?: "a" | "b" | "c" }) {
  // Each PQRST pulse is ~60 units wide. We tile 8 of them to fill 480.
  const beat =
    variant === "a"
      ? "0,30 6,30 8,28 10,32 12,30 18,30 20,15 22,42 24,8 26,48 28,30 34,30 38,22 42,30 50,30 54,32 56,28 58,30"
      : variant === "b"
        ? "0,30 8,30 10,29 12,31 14,30 18,30 20,18 22,40 24,12 26,46 28,30 36,30 40,24 44,30 50,30 54,30 58,30"
        : "0,30 6,30 8,30 10,28 12,32 14,30 18,30 20,16 22,44 24,10 26,48 28,30 34,30 36,30 40,21 44,30 50,30 58,30";
  const points: string[] = [];
  for (let i = 0; i < 8; i++) {
    beat.split(" ").forEach((p) => {
      const [x, y] = p.split(",");
      const xn = Number(x) + i * 60;
      points.push(`${xn},${y}`);
    });
  }
  return (
    <svg className="ecg-svg" viewBox="0 0 480 60" preserveAspectRatio="none" role="presentation">
      <polyline points={points.join(" ")} fill="none" />
    </svg>
  );
}

/* ---------- cases ---------- */
function CasesHero({ head: _head, count }: { head: PageHead; count: number }) {
  return (
    <header className="hero hero--cases">
      <div className="hero-cases-eyebrow">
        <span>Edición {new Date().getFullYear()}</span>
        <span className="crumb-dot" />
        <span>{count} historias</span>
      </div>
      <h1 className="hero-cases-title">
        Razonamiento <em>clínico</em>
        <br />
        en <span className="hero-cases-accent">primera persona</span>.
      </h1>
      <p className="hero-cases-lede">
        Cada caso es una historia completa: presentación, hallazgos clave, decisiones y desenlace.
        Pensado para leerse de principio a fin, no solo hojearse.
      </p>
    </header>
  );
}

/* ---------- info ---------- */
function InfoHero({ head, count }: { head: PageHead; count: number }) {
  return (
    <header className="hero hero--info">
      <div className="hero-info-poster" aria-hidden="true">
        <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern
              id="info-dots"
              x="0"
              y="0"
              width="10"
              height="10"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="1" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="200" height="200" fill="url(#info-dots)" />
          <circle cx="60" cy="80" r="48" className="poster-shape poster-shape--a" />
          <rect
            x="100"
            y="40"
            width="80"
            height="80"
            className="poster-shape poster-shape--b"
            transform="rotate(15 140 80)"
          />
          <polygon points="40,160 110,120 140,180" className="poster-shape poster-shape--c" />
        </svg>
      </div>
      <div className="hero-text">
        <div className="crumb">
          <span>Taote POCUS</span>
          <span className="crumb-dot" />
          <span>{head.crumb}</span>
        </div>
        <h1>{head.title}</h1>
        <p>{head.sub}</p>
        <span className="hero-meta">
          <span>{count}</span> piezas visuales
        </span>
      </div>
    </header>
  );
}

/**
 * Build a sparkline polyline ("x,y x,y …") of monthly case counts
 * over the last `months` calendar months ending on today. The path
 * is normalized to a 60×16 viewBox so the SVG can stretch with CSS.
 *
 * Returns `null` when there's not enough variation to be worth
 * drawing — a flat line at zero would just look like a dash.
 */
function buildSparkline(cases: CaseRecord[], months: number): string | null {
  if (cases.length === 0) return null;
  const now = new Date();
  const buckets = new Array<number>(months).fill(0);
  for (const c of cases) {
    const d = parseIsoDate(c.date);
    if (!d) continue;
    const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (monthsAgo >= 0 && monthsAgo < months) {
      const idx = months - 1 - monthsAgo;
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
  }
  const max = Math.max(...buckets, 1);
  if (max === 0) return null;
  const step = months > 1 ? 60 / (months - 1) : 0;
  return buckets
    .map((v, i) => {
      const x = i * step;
      // Invert y because SVG y grows downward; pad 2px top/bottom.
      const y = 14 - (v / max) * 12;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function parseIsoDate(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Format an ISO date as "2 abr" (Spanish short month, no year). */
function formatShortDate(iso: string): string {
  // Parse in local time. Inputs are YYYY-MM-DD.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
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
  return `${d} ${months[m - 1] ?? ""}`;
}
