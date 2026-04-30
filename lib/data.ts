// Static catalog data — sections, categories, common tag suggestions.
// The bundled cases corpus (`SEED_CASES`) used to live here too, but
// it was dragging the 6800-LOC `imported-cases.ts` into the initial
// client bundle on every route. The corpus now ships as a code-split
// chunk via `lib/seed-cases.ts` (async) + `hooks/useSeedCases` (the
// React bridge). Server-side consumers that need the full corpus
// import from `lib/seed-cases.ts` directly.

import type { Category, Section } from "./types";

export const SECTIONS: Section[] = [
  { id: "atlas", label: "Atlas POCUS", sub: "Imágenes y videos ecográficos por tema" },
  { id: "ecg", label: "ECG", sub: "Electrocardiogramas con interpretación" },
  { id: "cases", label: "Casos clínicos", sub: "Historias completas con razonamiento" },
  { id: "info", label: "Infografías", sub: "Algoritmos, protocolos y referencias visuales" },
];

export const CATEGORIES: Category[] = [
  { id: "cardiac", label: "Cardíaco" },
  { id: "lung", label: "Pulmonar" },
  { id: "abdominal", label: "Abdominal" },
  { id: "fast", label: "FAST / Trauma" },
  { id: "vascular", label: "Vascular" },
  { id: "ob", label: "Obstétrico" },
  { id: "ms", label: "Musculoesquelético" },
  { id: "proc", label: "Procedimientos" },
];

export const COMMON_TAGS = [
  "B-líneas",
  "Derrame pleural",
  "Neumotórax",
  "Consolidación",
  "Tamponade",
  "VI dilatado",
  "Disfunción VD",
  "FE reducida",
  "Pericarditis",
  "Líquido libre",
  "Hidronefrosis",
  "Colelitiasis",
  "Apendicitis",
  "TVP",
  "AAA",
  "Embarazo ectópico",
  "Latido fetal",
  "Bloqueo nervioso",
  "Acceso venoso",
  "Paracentesis",
  "Normal",
  "Patológico",
  "Pediátrico",
  "Crítico",
];

// SEED_CASES used to live here as a synchronous re-export of
// `IMPORTED_CASES`. It now ships as a code-split chunk; consumers
// load it via `lib/seed-cases.ts > loadSeedCases()` (async) or
// `hooks/useSeedCases` (React bridge). See the file header for
// rationale.
