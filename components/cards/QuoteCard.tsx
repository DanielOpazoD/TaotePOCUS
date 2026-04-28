"use client";

import { CATEGORIES } from "@/lib/data";
import type { CaseRecord } from "@/lib/types";

interface Props {
  caso: CaseRecord;
  onOpen: () => void;
}

/**
 * Quote-card variant. No thumbnail; the case is represented by a
 * fragment of its findings rendered as serif italic, with byline
 * underneath. Used in the atlas bento grid as a textual counterpoint
 * to the image-driven cards — magazine spreads do this all the time.
 *
 * Picks the first complete sentence from `findings` (falls back to
 * `summary` if findings is too short or empty), capped at ~140 chars
 * so the card stays uniform.
 */
export default function QuoteCard({ caso, onOpen }: Props) {
  const cat = CATEGORIES.find((c) => c.id === caso.category);
  const fragment = pickFragment(caso);
  return (
    <article
      className="quote-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Caso: ${caso.title}`}
    >
      <span className="quote-card-mark" aria-hidden="true">
        “
      </span>
      <p className="quote-card-text">{fragment}</p>
      <div className="quote-card-byline">
        <span>{caso.author}</span>
        <span className="dot" aria-hidden="true" />
        <span>{cat?.label}</span>
      </div>
    </article>
  );
}

function pickFragment(c: CaseRecord): string {
  const source = c.findings && c.findings.length > 60 ? c.findings : c.summary;
  if (!source) return c.title;
  const first = source.split(/\.\s+/)[0]?.trim() ?? "";
  if (!first) return source.slice(0, 140);
  return first.length > 140 ? `${first.slice(0, 137)}…` : `${first}.`;
}
