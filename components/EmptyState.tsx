"use client";

import type { ReactElement } from "react";
import { useT } from "@/hooks/useLanguage";
import type { DictKey } from "@/lib/i18n";
import type { View } from "@/lib/types";

interface EmptyAction {
  label: string;
  onClick: () => void;
}

interface Props {
  view: View;
  /** Optional override (e.g. favs view says "aún no has guardado"). */
  title?: string;
  message?: string;
  /** Optional CTA button rendered below the message. Empty states
   *  without an action are dead ends; with one, they become the
   *  start of a flow. */
  action?: EmptyAction;
}

/**
 * Editorial empty-state. Each section gets its own line drawing —
 * a small but specific illustration that says "this is the kind of
 * place this is" instead of a generic "no results" stub.
 *
 * Drawings are minimal SVG line art (no fills beyond hairlines) so
 * they read in both light and dark modes via `currentColor`. They're
 * marked `aria-hidden` because the heading + message carry the
 * semantic content.
 */
export default function EmptyState({ view, title, message, action }: Props) {
  const t = useT();
  const { glyph, titleKey, messageKey } = pickContent(view);
  return (
    <div className="empty empty--illustrated" role="status">
      <div className="empty-glyph" aria-hidden="true">
        {glyph}
      </div>
      <h3>{title ?? t(titleKey)}</h3>
      <p>{message ?? t(messageKey)}</p>
      {action && (
        <button type="button" className="empty-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * Resolve the right glyph + dict-key pair for the current view.
 *
 * Returning `DictKey`s (not pre-translated strings) keeps this helper
 * pure and free of React-context dependencies — the calling component
 * runs the `t()` lookup once it has the active language. Same pattern
 * `useShortcuts.SHORTCUTS` uses: data carries the dictionary handle,
 * the render site does the translation.
 */
function pickContent(view: View): {
  glyph: ReactElement;
  titleKey: DictKey;
  messageKey: DictKey;
} {
  if (view.kind === "favs") {
    return {
      glyph: <HeartGlyph />,
      titleKey: "empty.favs.title",
      messageKey: "empty.favs.message",
    };
  }
  if (view.kind === "admin") {
    return {
      glyph: <BookGlyph />,
      titleKey: "empty.admin.title",
      messageKey: "empty.admin.message",
    };
  }
  switch (view.section) {
    case "ecg":
      return {
        glyph: <FlatlineGlyph />,
        titleKey: "empty.ecg.title",
        messageKey: "empty.ecg.message",
      };
    case "cases":
      return {
        glyph: <BookGlyph />,
        titleKey: "empty.cases.title",
        messageKey: "empty.cases.message",
      };
    case "info":
      return {
        glyph: <PosterGlyph />,
        titleKey: "empty.info.title",
        messageKey: "empty.info.message",
      };
    case "rayos":
      return {
        glyph: <RibcageGlyph />,
        titleKey: "empty.rayos.title",
        messageKey: "empty.rayos.message",
      };
    default:
      return {
        glyph: <ProbeGlyph />,
        titleKey: "empty.default.title",
        messageKey: "empty.default.message",
      };
  }
}

/* ---------- glyphs ---------- */
/* Each is a 96×72 viewBox, line-art only, currentColor stroke. */

function ProbeGlyph() {
  // Linear ultrasound probe with the cone of insonation fanning out.
  return (
    <svg viewBox="0 0 96 72" className="empty-svg">
      {/* probe body */}
      <rect x="38" y="6" width="20" height="22" rx="3" />
      {/* footprint */}
      <line x1="38" y1="28" x2="58" y2="28" strokeWidth="1.6" />
      {/* cone */}
      <path d="M40 30 L24 64 L72 64 L56 30" />
      {/* echo lines inside cone */}
      <path d="M30 50 Q48 46 66 50" opacity="0.55" />
      <path d="M27 58 Q48 53 69 58" opacity="0.4" />
      <line x1="48" y1="36" x2="48" y2="40" opacity="0.6" />
    </svg>
  );
}

function FlatlineGlyph() {
  // ECG paper frame with one tiny remaining beat — the "almost flat" gag.
  return (
    <svg viewBox="0 0 96 72" className="empty-svg">
      <rect x="6" y="14" width="84" height="44" rx="2" />
      {/* faint grid */}
      <line x1="6" y1="36" x2="90" y2="36" opacity="0.25" strokeDasharray="2 3" />
      {/* lonely beat right of center, then flat */}
      <path d="M10 36 L40 36 L46 26 L48 50 L52 36 L90 36" />
    </svg>
  );
}

function BookGlyph() {
  // Open spread, two pages with a few text lines.
  return (
    <svg viewBox="0 0 96 72" className="empty-svg">
      <path d="M12 16 L48 22 L84 16 L84 60 L48 66 L12 60 Z" />
      {/* spine */}
      <line x1="48" y1="22" x2="48" y2="66" />
      {/* left page lines */}
      <line x1="20" y1="32" x2="42" y2="34.5" opacity="0.55" />
      <line x1="20" y1="40" x2="42" y2="42.5" opacity="0.55" />
      <line x1="20" y1="48" x2="36" y2="50.2" opacity="0.55" />
      {/* right page lines */}
      <line x1="54" y1="34.5" x2="76" y2="32" opacity="0.55" />
      <line x1="54" y1="42.5" x2="76" y2="40" opacity="0.55" />
      <line x1="54" y1="50.2" x2="70" y2="48" opacity="0.55" />
    </svg>
  );
}

function PosterGlyph() {
  // Folded poster — two panels with simple geometric content.
  return (
    <svg viewBox="0 0 96 72" className="empty-svg">
      {/* outer rectangle */}
      <rect x="14" y="8" width="68" height="56" rx="1.5" />
      {/* fold line */}
      <line x1="48" y1="8" x2="48" y2="64" opacity="0.45" strokeDasharray="2 3" />
      {/* left panel: circle + bar */}
      <circle cx="30" cy="26" r="7" />
      <rect x="22" y="42" width="20" height="3" />
      <rect x="22" y="50" width="14" height="3" opacity="0.55" />
      {/* right panel: triangle + bar */}
      <path d="M58 32 L70 18 L78 32 Z" />
      <rect x="56" y="42" width="22" height="3" />
      <rect x="56" y="50" width="16" height="3" opacity="0.55" />
    </svg>
  );
}

function RibcageGlyph() {
  // Stylized chest X-ray — outer torso silhouette, spine column down
  // the middle, four ribcage curves on each side. The Rayos section
  // primarily hosts chest plates / CT slices, so a chest is the most
  // recognizable cue.
  return (
    <svg viewBox="0 0 96 72" className="empty-svg">
      {/* outer film frame */}
      <rect x="6" y="6" width="84" height="60" rx="3" opacity="0.4" />
      {/* spine */}
      <line x1="48" y1="14" x2="48" y2="60" strokeWidth="1.4" />
      {/* clavicle hint */}
      <path d="M28 18 Q48 12 68 18" opacity="0.55" />
      {/* ribs (left side, 4 curves) */}
      <path d="M48 22 Q28 22 22 32" opacity="0.7" />
      <path d="M48 30 Q26 30 18 42" opacity="0.7" />
      <path d="M48 38 Q26 38 20 50" opacity="0.55" />
      <path d="M48 46 Q30 46 28 56" opacity="0.45" />
      {/* ribs (right side, mirrored) */}
      <path d="M48 22 Q68 22 74 32" opacity="0.7" />
      <path d="M48 30 Q70 30 78 42" opacity="0.7" />
      <path d="M48 38 Q70 38 76 50" opacity="0.55" />
      <path d="M48 46 Q66 46 68 56" opacity="0.45" />
    </svg>
  );
}

function HeartGlyph() {
  // Empty/dashed heart for the favs view.
  return (
    <svg viewBox="0 0 96 72" className="empty-svg">
      <path
        d="M48 60 C 22 44, 14 28, 26 18 C 36 10, 44 16, 48 24 C 52 16, 60 10, 70 18 C 82 28, 74 44, 48 60 Z"
        strokeDasharray="3 3"
      />
    </svg>
  );
}
