"use client";

import type { PageHead } from "@/lib/headers";

interface Props {
  head: PageHead;
}

/**
 * ECG hero — the landing of `/ecg`. Personality: waveform-as-decoration.
 *
 * Three animated polyline strips below the title evoke an ECG paper
 * recording. Each variant has slightly different rhythm so the rows
 * don't read as mirrored. Stroke is traced via stroke-dashoffset
 * animation in CSS (skipped under reduced motion).
 */
export default function EcgHero({ head }: Props) {
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
        {/* No "N trazados publicados" line — the toolbar below shows the
            live count. Hero shows context, toolbar shows the count. */}
      </div>
      <div className="hero-ecg-strip" aria-hidden="true">
        <EcgStrip />
        <EcgStrip variant="b" />
        <EcgStrip variant="c" />
      </div>
    </header>
  );
}

/**
 * A single ECG row, drawn as a polyline with 8 PQRST pulses tiled to
 * fill the 480-wide viewBox. Three variants give the three rows enough
 * rhythm variation that they don't look mirrored.
 */
function EcgStrip({ variant = "a" }: { variant?: "a" | "b" | "c" }) {
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
