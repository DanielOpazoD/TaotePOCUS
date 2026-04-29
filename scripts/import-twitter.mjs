#!/usr/bin/env node
// Twitter archive importer.
//
// Reads a Twitter export folder (the kind X gives you when you request
// your data), filters to original posts that look like clinical cases,
// classifies each one by section + category based on the text, and
// emits a JSON file with structured candidates for manual review +
// import into the catalog.
//
// Output: scripts/twitter-import-candidates.json
//
// Usage:
//   node scripts/import-twitter.mjs <path-to-twitter-archive>
//
// The script is read-only on the archive. Nothing is moved or copied
// — the output JSON references media files by their archive-relative
// path so a later import step can stage them.

import { readFileSync, writeFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Args + safety ───────────────────────────────────────────────────────────
const archivePath = process.argv[2];
if (!archivePath) {
  console.error("Usage: node scripts/import-twitter.mjs <path-to-twitter-archive>");
  process.exit(1);
}

// ─── Classification rules ────────────────────────────────────────────────────
//
// Each rule has: section (atlas/ecg/cases/info), category (one of the
// CategoryId values in lib/types.ts), and a regex that scores positive
// when matched. We pick the highest-scoring section+category combo per
// tweet. Order matters for ties — earlier rules win.

const SECTION_RULES = [
  // ECG-specific takes priority — text mentioning ECG is rarely also POCUS
  {
    section: "ecg",
    pattern:
      /\b(ecg|ekg|electrocardio|stemi|nstemi|omi\b|ami\b|infarct|stem(i|y)|sokolow|brugada|qt\s*long|wpw\b|wolff|fibrilaci|fl[uú]tter|bav|bloqueo\s*av|av\s*block|trifascic|hemibloqueo|bri\b|brd\b|lbbb|rbbb|preexcitaci|delta\s*wave)\b/i,
  },
  // Infografías — diagrams, protocols, mnemonics
  {
    section: "info",
    pattern:
      /\b(protocolo|algoritmo|infograf|mnemo|cheat\s*sheet|reference|pearls?|pearl|10 cosas|signos? de|criterios? de|escala\s*de|score\s+de)\b/i,
  },
  // Cases — has "caso" or extensive history
  {
    section: "cases",
    pattern:
      /\b(caso\s+cl[ií]nico|history|historia\s+cl[ií]nica|presentaci[oó]n\s+cl[ií]nica|clinical\s+vignette)\b/i,
  },
  // Default: atlas (image of an ultrasound finding)
  { section: "atlas", pattern: /\b(pocus|eco(?:graf|cardiograf)?|ultrasonido|ultrasound|us\b)/i },
];

const CATEGORY_RULES = [
  // Cardiac — drop trailing \b so stems like "cardi" match "cardiac",
  // "echocardiographic", "cardiomyopathy" etc. without a special case
  // for each suffix.
  {
    id: "cardiac",
    pattern:
      /(?:card[ií]\w*|heart|coraz[oó]n|pericardi|tampon|miocardi|ventr[ií]cul|aur[ií]cul|atri[ao]\b|atrial|ventricl?e|valvu|mitral|aort[ai]?\b|tricusp|wall\s*motion|stemi|\bomi\b|lvh\b|rvh\b|lvot|rvot|tapse|mapse|ejection|hypokine|akine|dyskine|systol|diastol|hypertrophy|hipertrofi|hipocine|aquine|prolapse|prolapso|regurgit|stenosis|estenosis|coronar\w*|fracci[oó]n\s+de\s+eyecci)/i,
  },
  // Lung — patterns / signs / pathologies. Add the specific sonographic findings.
  {
    id: "lung",
    pattern:
      /\b(pulmon|lung|b[\s-]?l[ií]nea|a[\s-]?l[ií]nea|consolidaci[oó]n|hepatizaci|neumot[oó]rax|seashore|barcode|stratosphere|sliding|deslizamiento|derrame\s*pleural|pleural\s*effusion|atelec|edema\s*pulmon|eap\b|epoc|copd\b|asma|tep\b|pe\s*lung|pleural\s*tap|sho?ur\s*sign|shred\s*sign|pleur(?:itis)?|bronch|tubular\s*sign|jellyfish)\b/i,
  },
  // Abdominal — organs + common pathologies. Aorta included here (not vascular)
  // because aortic pathology shown via abdominal scan is conventionally "abdominal POCUS".
  {
    id: "abdominal",
    pattern:
      /\b(abdom|hidronefros|hydronep|colelit|colecist|cholecyst|apendic|appendic|hep[aá]tic|liver|hepato|biliar|gallbladder|biliary|pancrea|esple|esplen|spleen|kidney|riñ[oó]n|renal|aorta|aaa\b|h[ií]gad|murphy|sonographic\s*murphy|wall\s*echogenic|coffee\s*bean|vesicula|gallstone|ascitis|ascites)\b/i,
  },
  {
    id: "fast",
    pattern:
      /\b(fast\s*exam|fast\b|trauma|morrison|esplenorenal|splen[oa]renal|peri\s*splenic|peri\s*hepatic|pelvis\s*free|hemoperit|hemot[oó]rax|liquid\s+libre|free\s*fluid|recess|douglas|dolor\s+abdomin\w*\s+post.{0,8}trauma)\b/i,
  },
  {
    id: "vascular",
    pattern:
      /\b(vascular|tvp\b|dvt\b|tromb|deep\s*vein|aneurism|aneurisma|carotid|car[oó]tid|ijv\b|jugular|vena\s*cava|ivc\b|color\s*doppler|flujo\s+inverso|popl[ií]te|femoral|saphenous|sa(fena|phena)|venous|arterial|stenosis\s*aort)\b/i,
  },
  {
    id: "ob",
    pattern:
      /\b(obst[eé]tric|obstetric|embarazo|pregnan|fetal|gestaci|placent|ect[oó]pico|ovari|uterin|tube|adnexal|early\s*pregnancy|first\s*trimester|yolk\s*sac|saco\s*gestacional|latido\s*fetal|fetal\s*heart|crl\b|fetus|teratoma)\b/i,
  },
  {
    id: "ms",
    pattern:
      /\b(musculo|skelet|tend[oó]n|tendon|articul|joint|fract|fract[uú]r|bursi|sino?vit|effusion\s+joint|hombro|rodilla|tobillo|wrist|shoulder|knee|ankle|hip\s*joint|cadera|baker|cyst\s+joint|nerv|m[uú]sculo|muscle\s*tear|hamstring)\b/i,
  },
  {
    id: "proc",
    pattern:
      /\b(procedimien|procedure|bloqueo\s+nervios|nerve\s+block|paracentes|toracocent|pleural\s+tap|cvc\b|catheter|punci[oó]n|guided|ecoguiad|biopsy|biopsia|access|venous\s+access|arterial\s+access|drainage|drenaje|fascia\s*il)\b/i,
  },
];

// Anatomical / context fallbacks — used when the primary regex didn't
// hit. Catches tweets that show a category-specific finding without
// using the category word explicitly (e.g. a B-line clip captioned
// "💮 Severe pulmonary edema" needs both "edema" AND "pulmonar" today).
const CATEGORY_FALLBACKS = [
  {
    id: "cardiac",
    pattern:
      /\b(😀.*💗|tampon|valv|chamber|c[aá]mara|mid-papillar|apical\s*4|parasternal|subxiphoid|psax|psl?ax|a4c|a2c)\b/i,
  },
  { id: "lung", pattern: /\b(plapsi|🫁|💧.*pleur|costoph)\b/i },
  {
    id: "abdominal",
    pattern: /\b(rim\s*sign|target\s*sign|halo\s*sign|whirlpool|wall\s*thicken|gut\s*ultraso)\b/i,
  },
  {
    id: "vascular",
    pattern: /\b(plethor|ivc\s*collaps|vena\s*cava\s*infer|filling\s*pressure)\b/i,
  },
  { id: "ob", pattern: /\b(saco|bhcg|hcg\b|trofo|chorion|amni)\b/i },
];

const FEATURED_HINTS =
  /\b(rare|raro|atypical|at[ií]pico|interesting|caso\s+interesante|destac|teaching|educational|🔥)\b/i;
const CRITICAL_HINTS =
  /\b(cr[ií]tico|emergenc|shock|cardiac\s+arrest|paro\s+cardi|tampon|massive|dissect|disecci|ruptured|aneurism|stemi|ami\b|peri[\s-]?arrest|impending)\b/i;
const PEDIATRIC_HINTS = /\b(pedi[aá]tric|child|niñ[oa]|bebé|infant|neonat|newborn)\b/i;

/**
 * Normalize Twitter's stylized Unicode (math-bold, math-italic, etc.)
 * back to plain ASCII so the regex classifier sees "Lung" instead of
 * "𝗟𝘂𝗻𝗴". Also unescapes HTML entities the archive ships.
 */
function normalize(text) {
  return text
    .normalize("NFKC")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"');
}

/**
 * Pick the most likely (section, category) pair for a given text.
 * Section default = atlas (POCUS). Category default = null (caller
 * has to set it manually for the unclassified pile).
 */
function classify(rawText) {
  const text = normalize(rawText);
  let section = null;
  for (const rule of SECTION_RULES) {
    if (rule.pattern.test(text)) {
      section = rule.section;
      break;
    }
  }
  let category = null;
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) {
      category = rule.id;
      break;
    }
  }
  if (!category) {
    for (const rule of CATEGORY_FALLBACKS) {
      if (rule.pattern.test(text)) {
        category = rule.id;
        break;
      }
    }
  }
  return { section, category };
}

function extractTags(rawText) {
  const text = normalize(rawText);
  const tags = new Set();
  if (FEATURED_HINTS.test(text)) tags.add("Destacado");
  if (CRITICAL_HINTS.test(text)) tags.add("Crítico");
  if (PEDIATRIC_HINTS.test(text)) tags.add("Pediátrico");
  // Hashtags from the original tweet — keep the ones that look useful.
  const hashtagRe = /#([a-záéíóúñ0-9_]+)/gi;
  let m;
  while ((m = hashtagRe.exec(text)) !== null) {
    const t = m[1].toLowerCase();
    if (t.length < 3) continue;
    if (
      /^(pocus|ecg|emergencyus|foamed|usmle|medtwitter|medicina|nuevafotodeperfil|hangaroa|rapanui)$/.test(
        t,
      )
    ) {
      // Skip the ultra-generic / non-medical ones — they don't filter the catalog.
      continue;
    }
    tags.add(m[1]);
  }
  return [...tags];
}

/** Strip URLs + trailing whitespace + leading hashtag-only lines. */
function cleanText(text) {
  return text
    .replace(/https?:\/\/t\.co\/\S+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const tweetsPath = join(archivePath, "data", "tweets.js");
const raw = readFileSync(tweetsPath, "utf8");
const tweets = JSON.parse(raw.replace(/^window\.YTD\.tweets\.part0\s*=\s*/, ""));

const candidates = [];
const skipStats = { rt: 0, reply: 0, noMedia: 0, noKeyword: 0 };

const ANY_MEDICAL = new RegExp(
  [
    ...SECTION_RULES.map((r) => r.pattern.source),
    ...CATEGORY_RULES.map((r) => r.pattern.source),
  ].join("|"),
  "i",
);

for (const t of tweets) {
  const tw = t.tweet;
  const text = tw.full_text || "";

  if (text.startsWith("RT ")) {
    skipStats.rt++;
    continue;
  }
  if (text.startsWith("@") || tw.in_reply_to_status_id) {
    skipStats.reply++;
    continue;
  }
  const media = (tw.extended_entities && tw.extended_entities.media) || tw.entities.media || [];
  if (media.length === 0) {
    skipStats.noMedia++;
    continue;
  }
  if (!ANY_MEDICAL.test(text)) {
    skipStats.noKeyword++;
    continue;
  }

  const { section, category } = classify(text);
  if (!section) {
    skipStats.noKeyword++;
    continue;
  }
  const cleanedText = cleanText(text);

  // For each media entry, build the local file path. Twitter packs
  // the file as `<tweet_id>-<media_id>.<ext>` in tweets_media/.
  const mediaEntries = media.map((m) => {
    const url = m.media_url_https || m.media_url;
    const filename = url ? basename(url) : null;
    // Local file: tweets_media/<tweet_id>-<original_basename>
    const localFile = filename ? `${tw.id_str}-${filename}` : null;
    let kind = "image";
    if (m.type === "video") kind = "video";
    else if (m.type === "animated_gif") kind = "gif";
    return {
      kind,
      localFile,
      remoteUrl: url,
      duration_ms: m.video_info?.duration_millis,
      // For videos, Twitter ships variant URLs with bitrates. The
      // archive includes the highest-quality variant as a local file
      // (with .mp4 extension). The basename in tweets_media/ matches
      // the variant url's basename, not the preview image's.
      variantBasenames: (m.video_info?.variants || [])
        .filter((v) => v.content_type === "video/mp4")
        .map((v) => basename(v.url.split("?")[0])),
    };
  });

  candidates.push({
    id: tw.id_str,
    createdAt: new Date(tw.created_at).toISOString(),
    text: cleanedText,
    classification: { section, category, tags: extractTags(text) },
    favorites: Number(tw.favorite_count) || 0,
    retweets: Number(tw.retweet_count) || 0,
    media: mediaEntries,
    sourceUrl: `https://x.com/TaotePOCUS/status/${tw.id_str}`,
  });
}

// Sort: most engaged first (favorites + retweets) then by date.
candidates.sort((a, b) => {
  const ea = a.favorites + a.retweets * 2;
  const eb = b.favorites + b.retweets * 2;
  if (ea !== eb) return eb - ea;
  return b.createdAt.localeCompare(a.createdAt);
});

// ─── Stats + write ───────────────────────────────────────────────────────────

const bySection = candidates.reduce((acc, c) => {
  acc[c.classification.section] = (acc[c.classification.section] || 0) + 1;
  return acc;
}, {});
const byCategory = candidates.reduce((acc, c) => {
  const k = c.classification.category || "(unclassified)";
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {});

const outPath = join(__dirname, "twitter-import-candidates.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      archivePath,
      stats: {
        totalTweets: tweets.length,
        candidates: candidates.length,
        skipped: skipStats,
        bySection,
        byCategory,
      },
      candidates,
    },
    null,
    2,
  ),
);

console.log("=== Twitter import — done ===");
console.log("Total tweets in archive:    ", tweets.length);
console.log("Candidates kept:            ", candidates.length);
console.log("");
console.log("Skipped:");
console.log("  Retweets:                 ", skipStats.rt);
console.log("  Replies:                  ", skipStats.reply);
console.log("  No media:                 ", skipStats.noMedia);
console.log("  No medical keyword:       ", skipStats.noKeyword);
console.log("");
console.log("By section:                 ", JSON.stringify(bySection));
console.log("By category:                ", JSON.stringify(byCategory));
console.log("");
console.log("Output:", outPath);
console.log("");
console.log("Top 5 by engagement:");
candidates.slice(0, 5).forEach((c, i) => {
  const blurb = c.text.replace(/\s+/g, " ").slice(0, 90);
  console.log(
    `  ${i + 1}. [${c.classification.section}/${c.classification.category}] ` +
      `❤️ ${c.favorites} 🔁 ${c.retweets} — ${blurb}…`,
  );
});

// ─── Markdown report ─────────────────────────────────────────────────────────
//
// Easier to scan than the JSON. Groups by section + category, shows
// title-line + media count + engagement, links to the original tweet.

const mdPath = join(__dirname, "twitter-import-candidates.md");

function group(arr, key) {
  return arr.reduce((acc, c) => {
    const k = key(c) || "(unclassified)";
    (acc[k] ||= []).push(c);
    return acc;
  }, {});
}

const titleLine = (text) =>
  text.split("\n").find((l) => l.trim().length > 5) || text.split(/\s+/).slice(0, 12).join(" ");

let md = `# Twitter import — review queue\n\n`;
md += `Archive: \`${archivePath}\`\n\n`;
md += `Generated: ${new Date().toISOString()}\n\n`;
md +=
  `**${candidates.length} candidates** kept from ${tweets.length} total tweets ` +
  `(${skipStats.rt} RTs, ${skipStats.reply} replies, ${skipStats.noMedia} no-media, ` +
  `${skipStats.noKeyword} no-keyword skipped).\n\n`;
md += `## By section\n\n`;
md += Object.entries(bySection)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- **${k}**: ${v}`)
  .join("\n");
md += `\n\n## By category\n\n`;
md += Object.entries(byCategory)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- **${k}**: ${v}`)
  .join("\n");

md += `\n\n---\n\n# Candidates\n\n`;
md += `Sorted by engagement (favorites + 2×retweets) within each group.\n\n`;

const bySectionGroup = group(candidates, (c) => c.classification.section);
for (const [section, list] of Object.entries(bySectionGroup)) {
  md += `\n## /${section} — ${list.length} candidates\n\n`;
  const byCatInSection = group(list, (c) => c.classification.category);
  for (const [cat, items] of Object.entries(byCatInSection)) {
    md += `\n### ${section} · ${cat}  *(${items.length})*\n\n`;
    for (const c of items) {
      const tags = c.classification.tags.length
        ? ` ${c.classification.tags.map((t) => `#${t}`).join(" ")}`
        : "";
      const date = c.createdAt.slice(0, 10);
      const t = titleLine(c.text).replace(/\s+/g, " ").trim().slice(0, 110);
      const mediaCount = c.media.length;
      const mediaKinds = [...new Set(c.media.map((m) => m.kind))].join("/");
      md += `- **${date}** [\`${c.id}\`](${c.sourceUrl}) — ❤️ ${c.favorites} 🔁 ${c.retweets} — ${mediaCount}× ${mediaKinds}${tags}\n`;
      md += `  > ${t}\n`;
    }
  }
}

writeFileSync(mdPath, md);
console.log("Markdown:", mdPath);
