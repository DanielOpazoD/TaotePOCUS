"use client";

import { AtlasHero, CasesHero, CompactHead, EcgHero, InfoHero } from "./hero";
import type { CaseRecord, View } from "@/lib/types";
import type { PageHead } from "@/lib/headers";

interface Props {
  view: View;
  cat: string | null;
  head: PageHead;
  scopedCases: CaseRecord[];
  onOpenCase: (id: string) => void;
}

/**
 * Section-aware hero dispatcher. Picks the right hero variant based
 * on the current view kind / section / category state, falling back
 * to the compact head for views where dramatic decoration would be
 * misleading (favs, admin, any time a category narrows the page).
 *
 * The heros themselves live in `components/hero/` — one file each so
 * editing one doesn't pull in the rest. This dispatcher only routes.
 *
 * Personality map:
 *   - atlas → numerical (stats + sparkline + featured CTA + aurora)
 *   - ecg   → waveform decoration (3 animated polyline strips)
 *   - cases → editorial typography (gradient title + lede)
 *   - info  → poster backdrop (geometric SVG with parallax)
 */
export default function SectionHero({ view, cat, head, scopedCases, onOpenCase }: Props) {
  // The compact head also carries the same `view-transition-name`s as
  // the full heros (in CSS) so navigating between hero ↔ compact
  // morphs the h1 + crumb in place rather than fading.
  if (view.kind !== "section" || cat) {
    return <CompactHead head={head} cat={cat} />;
  }

  switch (view.section) {
    case "atlas":
      return <AtlasHero head={head} cases={scopedCases} onOpenCase={onOpenCase} />;
    case "ecg":
      return <EcgHero head={head} />;
    case "cases":
      return <CasesHero />;
    case "info":
      return <InfoHero head={head} />;
    default:
      // TS exhaustiveness guard — adding a new SectionId without a
      // matching hero will surface here at compile time.
      return <CompactHead head={head} cat={cat} />;
  }
}
