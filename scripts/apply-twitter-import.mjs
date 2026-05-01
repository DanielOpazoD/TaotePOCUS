#!/usr/bin/env node
// Twitter import — apply step.
//
// Reads scripts/twitter-import-candidates.json (produced by
// import-twitter.mjs), takes the top N candidates by engagement,
// parses each tweet into a `CaseRecord` shape, copies the media file
// to `public/imports/`, and writes the resulting array to
// `lib/imported-cases.ts` ready to import from `lib/data.ts`.
//
// Usage:
//   node scripts/apply-twitter-import.mjs [count]
//
// `count` defaults to 50. Pass any number — or `all` to process every
// candidate in the JSON.
//
// Idempotent: re-running overwrites the output file and skips media
// that's already been copied.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(__dirname);

const candidatesPath = join(__dirname, "twitter-import-candidates.json");
const data = JSON.parse(readFileSync(candidatesPath, "utf8"));

const archivePath = data.archivePath;
const archiveMediaDir = join(archivePath, "data", "tweets_media");
const publicImportsDir = join(PROJECT_ROOT, "public", "imports");
mkdirSync(publicImportsDir, { recursive: true });

// ─── Args ────────────────────────────────────────────────────────────────────
const arg = process.argv[2] || "50";
const count = arg === "all" ? data.candidates.length : Math.max(1, Number(arg) || 50);
const slice = data.candidates.slice(0, count);

// ─── Text → fields ───────────────────────────────────────────────────────────
//
// Tweets in this archive follow a recognizable shape:
//   <emoji + Title line>
//   (blank)
//   #POCUS …hashtags
//   🌀/🔹 bullet point findings
//   💮 <Diagnosis>
//
// We extract title + description by line-level pattern matching.
// (Pre-ADR-0010 we also emitted separate `findings` / `summary` /
// `diagnosis` fields; that trio collapsed into one `description`
// field — see `parseFields` below for the actual extraction.)
// Decorative Unicode (𝗟𝘂𝗻𝗴 etc.) is normalized to plain ASCII via
// NFKC. HTML entities (&amp; &gt;) are unescaped.

function normalize(s) {
  return s
    .normalize("NFKC")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"');
}

// LEAD_EMOJI is unused now (cleanLine handles all emojis at once);
// keeping ALL_EMOJI for the body-cleaning step.
const ALL_EMOJI = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
const BULLET = /^[🌀🔹🔸▪▫🔺🔻▶➤◆●]\s*/u;
const DX_MARK = /^💮\s*/u;
const HASHTAG = /\s*#\w+/g;
// Zero-width joiners, variation selectors, byte-order marks — invisible
// characters Twitter occasionally ships in titles. Written with explicit
// Unicode escapes so the source stays grep-friendly and ESLint doesn't
// complain about "irregular whitespace" / combined-character classes.
// eslint-disable-next-line no-misleading-character-class
const INVISIBLES = /[\u200B-\u200F\u2060-\u206F\uFE00-\uFE0F\uFEFF]/g;

// Targeted EN→ES dictionary for the recurring clinical phrases in
// the user's tweets. Keep this surgical — full translation would
// need a real localization layer. Order matters: longer phrases
// are matched before their shorter substrings.
const TRANSLATIONS = [
  // Common diagnosis nouns / adjectives
  [
    /\bechocardiographic evaluation of coronary artery disease\b/i,
    "Evaluación ecocardiográfica de enfermedad coronaria",
  ],
  [/\bcoronary artery disease\b/i, "Enfermedad coronaria"],
  [/\bsmall bowel obstruction\b/i, "Obstrucción intestinal"],
  [/\bbowel obstruction\b/i, "Obstrucción intestinal"],
  [/\bacute acalculous cholecystitis\b/i, "Colecistitis aguda alitiásica"],
  [/\bcholecystitis\b/i, "Colecistitis"],
  [/\bpleural empyema\b/i, "Empiema pleural"],
  [/\bpleural effusion\b/i, "Derrame pleural"],
  [/\bpericardial effusion\b/i, "Derrame pericárdico"],
  [/\bcardiac tamponade\b/i, "Taponamiento cardíaco"],
  [/\bpulmonary embolism\b/i, "Tromboembolismo pulmonar"],
  [/\bsevere pulmonary hypertension\b/i, "Hipertensión pulmonar severa"],
  [/\bpulmonary hypertension\b/i, "Hipertensión pulmonar"],
  [/\bpulmonary edema\b/i, "Edema pulmonar"],
  [/\bheart failure\b/i, "Insuficiencia cardíaca"],
  [/\baortic dissection\b/i, "Disección aórtica"],
  [/\baortic aneurysm\b/i, "Aneurisma aórtico"],
  [/\baneurysm\b/i, "Aneurisma"],
  [/\bdeep vein thrombosis\b/i, "Trombosis venosa profunda"],
  [/\bvenous congestion\b/i, "Congestión venosa"],
  [/\bvenous thrombosis\b/i, "Trombosis venosa"],
  [/\bhydronephrosis\b/i, "Hidronefrosis"],
  [/\bpneumothorax\b/i, "Neumotórax"],
  [/\bpneumonia\b/i, "Neumonía"],
  [/\blung ultrasound\b/i, "Ultrasonido pulmonar"],
  [/\blung point\b/i, "Punto pulmonar"],
  [/\blung sliding\b/i, "Deslizamiento pleural"],
  [/\bb[\s-]*lines?\b/i, "Líneas B"],
  [/\ba[\s-]*lines?\b/i, "Líneas A"],
  [/\bfree fluid\b/i, "Líquido libre"],
  [/\bgallstones?\b/i, "Cálculos vesiculares"],
  [/\bgallbladder\b/i, "Vesícula"],
  [/\bappendicitis\b/i, "Apendicitis"],
  [/\becg evaluation\b/i, "Evaluación ECG"],
  // Demographic descriptors → drop, they're not titles
  [/\b\d+\s*y\/o\b/gi, ""],
  [/\b\d+\s*years?[\s-]*old\b/gi, ""],
  // Clinical history phrases that aren't titles
  [/\b\d+\s*(days?|weeks?|hours?|months?)\s+(with|w\/)\b/gi, ""],
  // Common short words
  [/\bsevere\b/i, "Severo"],
  [/\bacute\b/i, "Agudo"],
  [/\bchronic\b/i, "Crónico"],
  // "Right-sided venous congestion assessment" → "Evaluación de
  // congestión venosa derecha" — match the multi-word pattern first.
  [
    /\bright[\s-]*sided\s+venous\s+congestion\s+assessment\b/i,
    "Evaluación de congestión venosa derecha",
  ],
  [/\bright[\s-]*sided\b/i, "derecho"],
  [/\bleft[\s-]*sided\b/i, "izquierdo"],
  [/\benhanced physical examination\b/i, "Examen físico ecográfico"],
  [/\bduring fast exam\b/i, "Durante el FAST"],
  [/\bcompilation\b/i, "Compilación"],
  [/\b(scan|scanning) the\b/i, "explorar el"],
  [/\btip of (the )?liver\b/i, "punta hepática"],
  [/\bremember to\b/i, "no olvidar"],
  [/\bsuprarrenal tumor\b/i, "Tumor suprarrenal"],
  [/\babdominal pain\b/i, "Dolor abdominal"],
  [/\bvomiting\b/i, "vómitos"],
  [/\bfever\b/i, "fiebre"],
  [/\bassessment\b/i, "evaluación"],
  [/\bevaluation\b/i, "evaluación"],
  // Common general words that recur in titles
  [/\bcase\b/i, "caso"],
  [/\bcase[\s-]+with\b/i, "caso con"],
  [/\bwith\b/i, "con"],
  [/\bpatterns\b/i, "patrones"],
  [/\bin\s+lus\b/i, "en pulmonar"],
  [/\bdry cough\b/i, "tos seca"],
  [/\bsyncope\b/i, "Síncope"],
  [/\bretinal detachment\b/i, "Desprendimiento de retina"],
  [/\bpoint[\s-]of[\s-]care\s+ultrasonography\b/i, "Ecografía clínica"],
  [/\bcompilation\b/i, "Compilación"],
  [/\ba\s+compilación\b/i, "Compilación"],
  // Drop English articles that survive in mixed Spanish phrases
  [/^(a|the|an)\s+/i, ""],
];

/**
 * Strip decorative chrome from a single line: emojis (anywhere),
 * invisible chars, hashtags, multi-spaces, leading/trailing punctuation.
 */
function cleanLine(s) {
  return s
    .replace(INVISIBLES, "")
    .replace(ALL_EMOJI, "")
    .replace(HASHTAG, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:!?\-–—•·"'()[\]{}]+/, "")
    .replace(/[\s.,;:\-–—•·]+$/, "")
    .trim();
}

/** Apply the EN→ES dictionary in order. */
function translate(s) {
  let out = s;
  for (const [re, sub] of TRANSLATIONS) {
    out = out.replace(re, sub);
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Capitalize first letter; lowercase the rest only if it's all-caps. */
function tidyCase(s) {
  if (!s) return s;
  if (s.length > 4 && s === s.toUpperCase()) {
    s = s.charAt(0) + s.slice(1).toLowerCase();
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Hard cap title at maxChars without breaking a word. */
function trimTo(s, maxChars) {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars).replace(/\s+\S*$/, "") + "…";
}

function parseFields(rawText) {
  const text = normalize(rawText);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // ── Diagnosis ──────────────────────────────────────────────────────
  // The user's `💮 X` line is almost always the topical name of the
  // case ("Lung Point", "Cardiac tamponade", "Cholecystitis"…) —
  // exactly what we want as the title in a clean catalog. Use it.
  const dxLine = lines.find((l) => DX_MARK.test(l));
  const diagnosisRaw = dxLine ? dxLine.replace(DX_MARK, "") : "";
  const diagnosis = tidyCase(translate(cleanLine(diagnosisRaw))) || "Hallazgo POCUS";

  // ── Title ─────────────────────────────────────────────────────────
  // Prefer the diagnosis as the title. If absent, walk every line
  // looking for the first one with at least three letters and not
  // dominated by hashtags/emojis. Last resort: use a topic-shaped
  // fallback so the catalog never shows an empty title.
  let title = diagnosis;
  if (!dxLine) {
    const candidate = lines
      .map((l) => cleanLine(l))
      .find((l) => l && l.length > 5 && /[a-záéíóúñ]{3,}/i.test(l));
    title = candidate ? tidyCase(translate(candidate)) : "";
    if (!title || title.length < 4) {
      title = "Caso POCUS";
    }
  }
  // Catch the case where translation reordered words awkwardly: if
  // the title starts with a lowercase article-ish word ("derecho",
  // "izquierdo"), the original was structured English-style. Drop
  // those leading qualifiers — they read worse than just the noun.
  title = title.replace(/^(?:derecho|izquierdo|severo|agudo|crónico)\s+/i, "");
  title = tidyCase(title);
  title = trimTo(title, 70);

  // ── Description ──────────────────────────────────────────────────
  // Single canonical body field (replaces the old `findings` /
  // `summary` / `diagnosis` trio per ADR-0010). Prefer bullet-marked
  // lines (🌀/🔹) which are the user's curated sonographic findings;
  // otherwise use the cleaned body prose. The trio's other purposes
  // — `summary` for a short label, `diagnosis` for the conclusion —
  // are no longer separate columns; the longer description carries
  // them implicitly.
  const bulletLines = lines.filter((l) => BULLET.test(l));
  let description;
  if (bulletLines.length > 0) {
    const cleanedBullets = bulletLines
      .map((l) => cleanLine(l.replace(BULLET, "")))
      .map((l) => translate(l))
      .filter(Boolean);
    description = cleanedBullets.join(". ");
  } else {
    const body = lines
      .filter((l) => !DX_MARK.test(l))
      .map((l) => cleanLine(l))
      .filter(Boolean)
      .join(" ");
    description = translate(body);
  }
  if (description && !/[.…!?]$/.test(description)) description += ".";
  if (!description) description = `${title}.`;
  description = trimTo(description, 280);

  // `diagnosis` is computed above only so we can use it as the title
  // when the user marked one (`💮` line). It's NOT emitted as a
  // separate field on the CaseRecord output anymore.
  return { title, description };
}

// ─── Defaults for unclassified ───────────────────────────────────────────────
//
// CaseRecord requires a category. For candidates the classifier
// couldn't bucket, we assign a sensible default by section so the
// type stays satisfied — and add an `unclassified` tag so they're
// trivial to find and re-categorize manually.

const DEFAULT_CATEGORY_BY_SECTION = {
  atlas: "cardiac", // largest POCUS bucket
  ecg: "cardiac",
  cases: "cardiac",
  info: "cardiac",
};

// Loop kind picked per category so the synthetic fallback (if media
// fails to load) is at least topical.
const DEFAULT_LOOP_BY_CATEGORY = {
  cardiac: "tamponade",
  lung: "blines",
  abdominal: "morrison",
  fast: "morrison",
  vascular: "ijv",
  ob: "ob",
  ms: "blines",
  proc: "blines",
};

// ─── Media resolution ────────────────────────────────────────────────────────
//
// Each candidate's `media[0]` is the first attached image/video/gif.
// Twitter packs the video URL's basename + tweet id together — we
// look for the file that exists, prioritizing video (.mp4) over the
// poster image.

function pickMediaFile(c) {
  const m = c.media[0];
  if (!m) return null;

  // For images / gifs (rendered as gifs in Twitter): the localFile points
  // to a .jpg, but the archive includes the actual mp4 for animated_gif
  // type. Prefer mp4 if present.
  if (m.kind === "image") {
    if (m.localFile) {
      const p = join(archiveMediaDir, m.localFile);
      if (existsSync(p)) return { source: p, kind: "image" };
    }
  } else {
    // video or gif — try variant basenames first (these are the mp4s).
    for (const v of m.variantBasenames || []) {
      const candidate = `${c.id}-${v}`;
      const p = join(archiveMediaDir, candidate);
      if (existsSync(p)) return { source: p, kind: m.kind };
    }
    // Fall back to the local file (poster jpg).
    if (m.localFile) {
      const p = join(archiveMediaDir, m.localFile);
      if (existsSync(p)) return { source: p, kind: "image" };
    }
  }
  return null;
}

// ─── Build CaseRecord ────────────────────────────────────────────────────────

const imported = [];
const skipped = [];

for (const c of slice) {
  const media = pickMediaFile(c);
  if (!media) {
    skipped.push({ id: c.id, reason: "no media file resolved" });
    continue;
  }

  const { title, description } = parseFields(c.text);
  const category =
    c.classification.category || DEFAULT_CATEGORY_BY_SECTION[c.classification.section] || "cardiac";
  const loop = DEFAULT_LOOP_BY_CATEGORY[category] || "blines";

  // Copy media into public/imports/ with a stable filename based on
  // the tweet id. Idempotent: skip if already copied. The folder is
  // gitignored — production reads from the Netlify Blobs store named
  // `imports`, populated by `scripts/upload-media-to-blobs.mjs`. Local
  // dev still uses these files as the source of truth that the upload
  // script reads from.
  const ext = extname(media.source);
  const destBasename = `${c.id}${ext}`;
  const dest = join(publicImportsDir, destBasename);
  if (!existsSync(dest)) {
    copyFileSync(media.source, dest);
  }

  // Tags: classifier hints + a `Sin clasificar` marker when the
  // category is a fallback default rather than a real match. Origin
  // info (Twitter) lives in the case id (`tw-…`) and the file banner
  // — not on every case's tag chip row, where it would just be noise.
  const tags = [...c.classification.tags];
  if (!c.classification.category) tags.push("Sin clasificar");

  // Featured: top-tier engagement gets featured. Threshold tuned so
  // ~10 % of imports are featured by default — adjust if it's loud.
  const engagement = c.favorites + c.retweets * 2;
  const featured = engagement >= 250;

  imported.push({
    id: `tw-${c.id}`,
    section: c.classification.section,
    title,
    category,
    tags,
    modality: c.classification.section === "ecg" ? "ECG · 12 derivaciones" : "POCUS",
    loop,
    author: "@TaotePOCUS",
    role: "Médico",
    date: c.createdAt.slice(0, 10),
    description,
    ...(featured ? { featured: true } : {}),
    media: {
      kind: media.kind,
      // URL points at the /api/media/[id] route handler, which streams
      // from the `imports` blob store. After running this script,
      // remember to also run `node scripts/upload-media-to-blobs.mjs`
      // to push the new files to the store — until then, production
      // will 404 on these `src` URLs.
      src: `/api/media/${destBasename}`,
    },
    // Audit metadata: which tweet this came from. Not part of CaseRecord
    // type today — but harmless and useful for tracing back to the
    // original. We strip it before serialization to lib/imported-cases.ts.
    __twitter: {
      sourceUrl: c.sourceUrl,
      engagement,
      classifiedCategory: c.classification.category,
    },
  });
}

// ─── Emit lib/imported-cases.ts ──────────────────────────────────────────────

const outPath = join(PROJECT_ROOT, "lib", "imported-cases.ts");
const banner = `// AUTO-GENERATED by scripts/apply-twitter-import.mjs
//
// Cases imported from the @TaotePOCUS Twitter archive.
// Source: ${archivePath}
// Generated: ${new Date().toISOString()}
// Count: ${imported.length} cases
//
// Edit the source tweets via the apply script (re-run with a higher
// count, or revise classifier rules in import-twitter.mjs first), or
// hand-edit individual cases here — but expect the next regeneration
// to overwrite hand edits unless you remove the generation banner.

import type { CaseRecord } from "./types";

`;

const tsArrayLiteral = imported.map((c) => {
  // Strip the audit metadata before serializing — the type doesn't
  // declare it. Keep a comment with the source URL above each case
  // so the trail back to Twitter survives the trip into TS-land.
  const { __twitter, ...record } = c;
  const recordJson = JSON.stringify(record, null, 2).replace(/^/gm, "  ").trimStart();
  return `  // [${__twitter.engagement} eng]  ${__twitter.sourceUrl}\n  ${recordJson}`;
});

const fileContent =
  banner +
  `export const IMPORTED_CASES: CaseRecord[] = [\n` +
  tsArrayLiteral.join(",\n") +
  `,\n];\n`;

writeFileSync(outPath, fileContent);

// ─── Stats ───────────────────────────────────────────────────────────────────

const byCategory = imported.reduce((acc, c) => {
  acc[c.category] = (acc[c.category] || 0) + 1;
  return acc;
}, {});
const bySection = imported.reduce((acc, c) => {
  acc[c.section] = (acc[c.section] || 0) + 1;
  return acc;
}, {});
const featuredCount = imported.filter((c) => c.featured).length;

console.log("=== Twitter import — apply ===");
console.log(`Processed top ${count} of ${data.candidates.length} candidates.`);
console.log(`Imported:  ${imported.length}`);
console.log(`Skipped:   ${skipped.length}${skipped.length ? " (no media)" : ""}`);
console.log("");
console.log("By section: ", JSON.stringify(bySection));
console.log("By category:", JSON.stringify(byCategory));
console.log(`Featured:   ${featuredCount}`);
console.log("");
console.log(`Media copied to: ${publicImportsDir}`);
console.log(`Cases written to: ${outPath}`);
console.log("");
console.log("Next steps:");
console.log("  1. Edit lib/data.ts to merge IMPORTED_CASES into SEED_CASES");
console.log("     (or expose it as a separate constant the app picks up).");
console.log("  2. Run: npm run typecheck && npm test");
console.log("  3. Open localhost:3010 and review the imported cases.");
