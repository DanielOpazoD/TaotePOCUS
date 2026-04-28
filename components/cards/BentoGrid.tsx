"use client";

import CaseCard from "./CaseCard";
import QuoteCard from "./QuoteCard";
import type { CaseRecord } from "@/lib/types";

interface Props {
  cases: CaseRecord[];
  favs: string[];
  onOpen: (c: CaseRecord) => void;
  onFav: (c: CaseRecord) => void;
}

/**
 * Atlas bento grid. The unfiltered atlas landing renders cards in a
 * deliberately uneven 3-column layout — one featured hero spans 2×2,
 * two "quote" cards (no image, serif italic fragment) sit in the
 * flow as textual counterpoints, the rest are standard CaseCards.
 *
 * The layout is the visual signature of "página de 2024" — Apple
 * institutionalized it, Vercel/Linear use it for landings. Here it
 * stays editorial because the typography and color narrative are
 * tuned for educational content, not marketing.
 *
 * Picking strategy:
 *   - hero  = first featured case, fallback to first case
 *   - quotes = the next 2 featured cases
 *   - rest   = everything else, in date order
 *
 * Quote cards are interleaved at fixed positions (after the 2nd and
 * 5th rest item) so the bento doesn't accidentally cluster them.
 */
export default function BentoGrid({ cases, favs, onOpen, onFav }: Props) {
  if (cases.length === 0) return null;

  const hero = cases.find((c) => c.featured) ?? cases[0];
  if (!hero) return null;

  const quoteCandidates = cases.filter((c) => c.id !== hero.id && c.featured).slice(0, 2);
  const usedIds = new Set([hero.id, ...quoteCandidates.map((c) => c.id)]);
  const rest = cases.filter((c) => !usedIds.has(c.id));

  // Build a flat list of (CaseCard | QuoteCard) renderings. Quotes go
  // after rest item index 1 (so positions 2 and 5 in the visible flow).
  const tail: { kind: "case" | "quote"; caso: CaseRecord }[] = [];
  rest.forEach((c, i) => {
    tail.push({ kind: "case", caso: c });
    if (i === 1 && quoteCandidates[0]) tail.push({ kind: "quote", caso: quoteCandidates[0] });
    if (i === 4 && quoteCandidates[1]) tail.push({ kind: "quote", caso: quoteCandidates[1] });
  });

  return (
    <div className="case-grid case-grid--bento">
      <div className="bento-hero" data-bento="hero">
        <CaseCard
          caso={hero}
          isFav={favs.includes(hero.id)}
          onFav={() => onFav(hero)}
          onOpen={() => onOpen(hero)}
        />
      </div>
      {tail.map((item) =>
        item.kind === "quote" ? (
          <QuoteCard key={`q-${item.caso.id}`} caso={item.caso} onOpen={() => onOpen(item.caso)} />
        ) : (
          <CaseCard
            key={item.caso.id}
            caso={item.caso}
            isFav={favs.includes(item.caso.id)}
            onFav={() => onFav(item.caso)}
            onOpen={() => onOpen(item.caso)}
          />
        ),
      )}
    </div>
  );
}
