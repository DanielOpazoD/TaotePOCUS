"use client";

import { CompactHead } from "./hero";
import type { View } from "@/lib/types";
import type { PageHead } from "@/lib/headers";

interface Props {
  view: View;
  cat: string | null;
  head: PageHead;
}

/**
 * Section header. Until May-2026 this dispatched to per-section heros
 * with distinct personalities (numerical Atlas with stats + sparkline
 * + featured CTA, waveform-decorated ECG, gradient-title Cases,
 * poster-backdrop Info). User feedback asked for the case grid to
 * carry the section, not the header — the dramatic banners pushed
 * the actual content below the fold and read as a marketing landing
 * rather than a working catalog.
 *
 * Now every section renders the same `CompactHead`: crumb + h1 +
 * subtitle, no decoration, tight vertical rhythm. The dispatcher
 * stays as the single insertion point so future per-section accents
 * (e.g. a thin colored rule under the title) can be added here
 * without changing every caller. `view` and `cat` are kept on the
 * Props for that future and so the transition-names in CSS still
 * pair correctly when navigating section ↔ category page.
 *
 * `scopedCases` and `onOpenCase` were previously used by the Atlas
 * hero's "Caso destacado" CTA — both are gone now. Callers (App.tsx)
 * stopped passing them in the same edit.
 */
export default function SectionHero({ head, cat }: Props) {
  return <CompactHead head={head} cat={cat} />;
}
