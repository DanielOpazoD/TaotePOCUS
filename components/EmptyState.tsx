"use client";

import type { ReactElement } from "react";
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
  const { glyph, defaultTitle, defaultMessage } = pickContent(view);
  return (
    <div className="empty empty--illustrated" role="status">
      <div className="empty-glyph" aria-hidden="true">
        {glyph}
      </div>
      <h3>{title ?? defaultTitle}</h3>
      <p>{message ?? defaultMessage}</p>
      {action && (
        <button type="button" className="empty-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function pickContent(view: View): {
  glyph: ReactElement;
  defaultTitle: string;
  defaultMessage: string;
} {
  if (view.kind === "favs") {
    return {
      glyph: <HeartGlyph />,
      defaultTitle: "Aún no has guardado casos",
      defaultMessage: "Toca el corazón en cualquier caso para añadirlo a tu colección.",
    };
  }
  if (view.kind === "admin") {
    return {
      glyph: <BookGlyph />,
      defaultTitle: "Sin publicaciones",
      defaultMessage: "Cuando subas tu primer caso aparecerá aquí.",
    };
  }
  switch (view.section) {
    case "ecg":
      return {
        glyph: <FlatlineGlyph />,
        defaultTitle: "Trazado plano",
        defaultMessage: "Ningún ECG coincide con esos filtros. Prueba ajustar la búsqueda.",
      };
    case "cases":
      return {
        glyph: <BookGlyph />,
        defaultTitle: "Sin historias",
        defaultMessage: "No hay casos clínicos para esa combinación. Limpia filtros y reintenta.",
      };
    case "info":
      return {
        glyph: <PosterGlyph />,
        defaultTitle: "Sin infografías",
        defaultMessage: "No encontramos piezas visuales con esos criterios.",
      };
    default:
      return {
        glyph: <ProbeGlyph />,
        defaultTitle: "Sin resultados",
        defaultMessage: "Prueba quitando filtros o buscando por otra palabra.",
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
