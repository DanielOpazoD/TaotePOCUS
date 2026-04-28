import type { ReactElement } from "react";

// Unified icon grammar:
//   - 24×24 viewBox
//   - stroke-width 1.5 (thinner than Tabler/Feather defaults; matches
//     the editorial column rules and the Linear/Phosphor/Raycast look)
//   - round caps + joins so terminals don't bite
//   - currentColor everywhere — icons inherit the surrounding ink
//
// Adding a new icon? Use this exact stroke spread and keep the path
// inside the 24×24 box with ~2-3 units of padding from the edges.
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Icon = {
  search: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  heart: (filled?: boolean): ReactElement => (
    <svg viewBox="0 0 24 24" {...stroke} fill={filled ? "currentColor" : "none"}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  ),
  share: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  ),
  plus: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...stroke}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  edit: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  trash: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...stroke}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  ),
  upload: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  close: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...stroke}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  play: (): ReactElement => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  ),
  pause: (): ReactElement => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  ),
  user: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  presentation: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...stroke}>
      {/* Projection screen with an upward tick on the easel — clean
         silhouette over the previous tangled path. */}
      <rect x="3" y="4" width="18" height="12" rx="1" />
      <path d="M12 16v4" />
      <path d="M8 20h8" />
      <path d="M8 11l3-3 2 2 3-4" />
    </svg>
  ),
  arrowLeft: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  ),
  arrowRight: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  ),
  menu: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...stroke}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
};

export const CategoryGlyph: Record<string, ReactElement> = {
  cardiac: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M3 12h4l2-4 4 8 2-4h6" />
    </svg>
  ),
  lung: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 4v9" />
      <path d="M8 21c-2.5 0-4-2-4-5V11c0-2 1-4 3-5l1 8c0 4-1 7-2 7z" />
      <path d="M16 21c2.5 0 4-2 4-5V11c0-2-1-4-3-5l-1 8c0 4 1 7 2 7z" />
    </svg>
  ),
  abdominal: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M5 9c0-3 3-5 7-5s7 2 7 5v6c0 3-3 5-7 5s-7-2-7-5z" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  ),
  fast: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  vascular: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 12c4 0 4-6 8-6s4 6 8 6" />
      <path d="M4 18c4 0 4-6 8-6s4 6 8 6" />
    </svg>
  ),
  ob: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="14" cy="11" r="2" fill="currentColor" stroke="none" />
    </svg>
  ),
  ms: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M5 5c0 2 1 3 2 3 0 2 1 3 2 3l5 5c0 1 1 2 3 2s2 1 2 3" />
      <path d="M3 7c0-1 1-2 2-2s2 1 2 2-1 2-2 2-2-1-2-2zM17 19c0-1 1-2 2-2s2 1 2 2-1 2-2 2-2-1-2-2z" />
    </svg>
  ),
  proc: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M18 2 22 6M14 6l6 6-3 3-9-3-3-9 3-3z" />
      <path d="m8 16-6 6" />
    </svg>
  ),
};
