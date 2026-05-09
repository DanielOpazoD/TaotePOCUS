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
  { id: "rayos", label: "Rayos", sub: "Radiografías, TAC y otros estudios de imagen" },
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
  // "Crítico" was removed from the suggested-tags vocabulary in
  // May-2026. It was over-applied on the imported corpus and the red
  // pulsing thumb badge that paired with it (`.case-thumb-crit`) was
  // dropped at the same time. The tag isn't reserved — admins can
  // still type it — it just isn't surfaced as a suggestion.
];

// SEED_CASES used to live here as a synchronous re-export of
// `IMPORTED_CASES`. It now ships as a code-split chunk; consumers
// load it via `lib/seed-cases.ts > loadSeedCases()` (async) or
// `hooks/useSeedCases` (React bridge). See the file header for
// rationale.

/**
 * Tag value the Twitter import script writes onto every case it
 * brings in, so the admin classifier can find them under "Sin
 * clasificar / Unclassified" and route them to the right section
 * + category.
 *
 * The literal value `"Sin clasificar"` is **data, not UI copy**:
 *   - It lands inside `CaseRecord.tags.es` at import time (see
 *     `scripts/apply-twitter-import.mjs`).
 *   - Every classification action (drag-drop, reclassify menu,
 *     bulk patch) STRIPS this tag from the case so it disappears
 *     from the queue.
 *   - The classifier filter pill that says "Sin clasificar" /
 *     "Unclassified" comes from the i18n dictionary
 *     (`classifier.tab.unclassified`) — a separate concern from
 *     this marker. Their values happen to coincide in Spanish
 *     because the marker was authored in Spanish; that's a string-
 *     comparison detail, not a translation contract.
 *
 * Centralising the literal as a constant prevents the marker logic
 * from coupling to the UI language and lets us rename / migrate it
 * in one place if the import script ever changes its convention.
 */
export const IMPORT_MARKER_TAG = "Sin clasificar";
