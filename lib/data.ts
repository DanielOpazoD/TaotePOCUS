import type { CaseRecord, Category, Section } from "./types";
import { IMPORTED_CASES } from "./imported-cases";

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

// SEED_CASES is now exclusively the Twitter-imported corpus. The
// synthetic placeholder cases were removed once the real archive
// produced enough material — see lib/imported-cases.ts for the
// auto-generated list and scripts/apply-twitter-import.mjs for the
// regeneration pipeline.
export const SEED_CASES: CaseRecord[] = [...IMPORTED_CASES];
