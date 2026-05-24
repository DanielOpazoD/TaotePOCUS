#!/usr/bin/env node
// EN translation coverage report for the case corpus.
//
// What it solves
// ──────────────
// The catalog cards + modal use `FallbackBadge` to show a small "ES"
// pill when an EN-mode visitor opens a case the admin hasn't
// translated yet. Without surfacing the AGGREGATE coverage, that
// debt is invisible cognitively — every individual badge looks like
// "just this one", but the catalog is mostly Spanish.
//
// This script reads `public/data/imported-cases.json` and emits a
// human-readable report:
//
//   i18n coverage (326 cases):
//     Title:       12 / 326 EN  ( 3.7%)
//     Description: 8  / 326 EN  ( 2.5%)
//     Tags:        14 / 326 EN  ( 4.3%)
//     Section breakdown:
//       atlas:  10 / 301 ( 3.3%) titles translated
//       ecg:    2  / 23  ( 8.7%) titles translated
//       cases:  0  / 2   ( 0.0%) titles translated
//
// Run on demand, or wire it into the build so the number is in your
// face every deploy.
//
// Usage
// ─────
//   node scripts/i18n-coverage.mjs            # human report
//   node scripts/i18n-coverage.mjs --json     # machine-parseable
//   node scripts/i18n-coverage.mjs --min=50   # exit 1 if any axis < 50%
//
// Shape tolerance
// ───────────────
// The on-disk corpus stores `title` as a plain string (Spanish only,
// migrated at read time to `{ es, en }` via `normalizeCase`). EN
// translations live in admin overrides + ship via the backup
// envelope. So depending on how the corpus was generated, an entry
// can be:
//
//   - `title: "Hipertrofia ventricular"`       → ES only
//   - `title: { es: "Hipertrofia", en: null }` → ES only
//   - `title: { es: "Hipertrofia", en: "..." }`→ EN translated ✓
//
// Treat all three cases consistently: only the third counts as
// translated. Same logic for `description` (string field) and
// `tags` (array vs `{ es, en }` shape).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const CORPUS_PATH = join(ROOT, "public/data/imported-cases.json");

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const minArg = args.find((a) => a.startsWith("--min="));
const MIN_PCT = minArg ? Number(minArg.slice("--min=".length)) : null;

// ── load + parse ────────────────────────────────────────────────

let raw;
try {
  raw = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
} catch (err) {
  console.error(`[i18n-coverage] Could not read ${CORPUS_PATH}: ${err.message}`);
  process.exit(1);
}

// Some envelopes wrap the array as `{ cases: [...] }`; others are
// a bare array. Accept both.
const cases = Array.isArray(raw) ? raw : Array.isArray(raw.cases) ? raw.cases : [];
if (cases.length === 0) {
  console.error(`[i18n-coverage] Corpus parsed but contained 0 cases.`);
  process.exit(1);
}

// ── classifiers — has-EN per field ──────────────────────────────

function hasEnString(value) {
  if (value == null) return false;
  if (typeof value === "string") return false; // plain ES baseline
  if (typeof value === "object") {
    return typeof value.en === "string" && value.en.trim().length > 0;
  }
  return false;
}

function hasEnTags(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return false; // legacy bare-array shape
  if (typeof value === "object") {
    return Array.isArray(value.en) && value.en.length > 0;
  }
  return false;
}

// ── aggregate ───────────────────────────────────────────────────

const total = cases.length;
let titleEn = 0;
let descEn = 0;
let tagsEn = 0;
const bySection = new Map(); // section -> { total, titleEn, descEn, tagsEn }

for (const c of cases) {
  const t = hasEnString(c.title);
  const d = hasEnString(c.description);
  const tg = hasEnTags(c.tags);
  if (t) titleEn++;
  if (d) descEn++;
  if (tg) tagsEn++;

  const section = c.section ?? "unknown";
  if (!bySection.has(section)) {
    bySection.set(section, { total: 0, titleEn: 0, descEn: 0, tagsEn: 0 });
  }
  const s = bySection.get(section);
  s.total++;
  if (t) s.titleEn++;
  if (d) s.descEn++;
  if (tg) s.tagsEn++;
}

const pct = (n, d) => (d === 0 ? 0 : (n / d) * 100);
const fmt = (n) => n.toFixed(1).padStart(4, " ");

const report = {
  total,
  title: { translated: titleEn, percent: pct(titleEn, total) },
  description: { translated: descEn, percent: pct(descEn, total) },
  tags: { translated: tagsEn, percent: pct(tagsEn, total) },
  bySection: Object.fromEntries(
    [...bySection.entries()].map(([section, s]) => [
      section,
      {
        total: s.total,
        title: { translated: s.titleEn, percent: pct(s.titleEn, s.total) },
        description: { translated: s.descEn, percent: pct(s.descEn, s.total) },
        tags: { translated: s.tagsEn, percent: pct(s.tagsEn, s.total) },
      },
    ]),
  ),
};

// ── output ──────────────────────────────────────────────────────

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`i18n coverage (${total} cases):`);
  console.log(
    `  Title:       ${String(titleEn).padStart(3)} / ${total} EN  (${fmt(report.title.percent)}%)`,
  );
  console.log(
    `  Description: ${String(descEn).padStart(3)} / ${total} EN  (${fmt(report.description.percent)}%)`,
  );
  console.log(
    `  Tags:        ${String(tagsEn).padStart(3)} / ${total} EN  (${fmt(report.tags.percent)}%)`,
  );
  console.log();
  console.log(`  Section breakdown (titles only):`);
  for (const [section, s] of bySection.entries()) {
    console.log(
      `    ${section.padEnd(8)} ${String(s.titleEn).padStart(3)} / ${String(s.total).padStart(
        3,
      )} (${fmt(pct(s.titleEn, s.total))}%)`,
    );
  }
}

// ── threshold gate ──────────────────────────────────────────────

if (MIN_PCT != null) {
  const fail = [
    ["title", report.title.percent],
    ["description", report.description.percent],
    ["tags", report.tags.percent],
  ].filter(([, p]) => p < MIN_PCT);
  if (fail.length > 0) {
    console.error();
    console.error(`[i18n-coverage] FAIL — ${fail.length} axis(es) below ${MIN_PCT}%:`);
    for (const [name, p] of fail) {
      console.error(`  - ${name}: ${p.toFixed(1)}% < ${MIN_PCT}%`);
    }
    process.exit(1);
  }
}
