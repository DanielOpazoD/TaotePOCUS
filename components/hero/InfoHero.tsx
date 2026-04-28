"use client";

import type { PageHead } from "@/lib/headers";

interface Props {
  head: PageHead;
}

/**
 * Info hero — the landing of `/info`. Personality: poster-style.
 *
 * A geometric SVG backdrop (dot pattern + circle + dashed rotated
 * rectangle + triangle) sits behind the title. CSS drives a scroll-
 * driven parallax on the backdrop via `animation-timeline: view()`
 * where supported (Chromium); the title stays anchored.
 */
export default function InfoHero({ head }: Props) {
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
        {/* No "N piezas visuales" — the toolbar carries the live count. */}
      </div>
    </header>
  );
}
