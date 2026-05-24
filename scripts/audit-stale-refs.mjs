#!/usr/bin/env node
// Audit for stale references in code comments.
//
// What it catches
// ───────────────
// When a CSS class, function, or component gets removed, the
// removed identifier sometimes lives on in nearby comments that
// reference it ("the old `.case-thumb-preview` was…"). Over time
// those drift into pure noise — the new reader has to grep to
// confirm the class actually doesn't exist anymore.
//
// This script grep-walks `app/` + `components/` + `hooks/` + `lib/`
// for CSS class / identifier mentions inside comments, then checks
// whether the identifier actually exists in the codebase. Anything
// that's only mentioned in comments is flagged.
//
// Usage
// ─────
//   node scripts/audit-stale-refs.mjs              # human report
//   node scripts/audit-stale-refs.mjs --strict     # exit 1 if any found
//
// Scope
// ─────
// We only check `.css-class-name` patterns (a hyphen-separated
// identifier prefixed with a dot, inside a `/* … */` or `//` comment
// block). Function / variable names are too noisy — every comment
// references some identifier, and most of them are still live.
//
// CSS class drift is the high-signal subset: classes get renamed or
// removed during visual passes, and the comments that explain WHY
// the class exists tend to mention it by name. When the class is
// removed but the comment isn't, the comment becomes a lie.
//
// False positives
// ───────────────
// A class that's only used dynamically (built from a template
// string) won't be found by the grep, so its mention in a comment
// will look stale. This is rare enough to handle with the
// `ALLOWLIST` set below; add the dynamically-built class names
// explicitly to keep the report quiet.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const STRICT = process.argv.includes("--strict");

// Directories scanned for both CSS class definitions AND
// references-in-comments. Keep in sync with `eslint.config.mjs`'s
// scope — they should match.
const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const ALLOWED_EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".jsx", ".css"]);

// Classes that EXIST but are constructed dynamically and won't be
// caught by a literal grep. Add carefully — each entry mutes a
// real signal source.
const ALLOWLIST = new Set([
  // None right now. Add as needed.
]);

// ── walk + collect ──────────────────────────────────────────────

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      files.push(...walk(p));
    } else if (ALLOWED_EXTS.has(extname(entry))) {
      files.push(p);
    }
  }
  return files;
}

const allFiles = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

// Two passes over the corpus:
//   1. existing — classes referenced ANYWHERE outside a comment
//      (className="…", from a template literal, in a CSS selector).
//   2. inComment — classes referenced ONLY inside a comment.
// Diff: (inComment - existing) - ALLOWLIST = stale references.

const existing = new Set();
const inComment = new Map(); // class -> [{ file, line }]

// Strip line + block comments so we can search the "live" code body
// without false-matching the same string inside a comment.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

// CSS class pattern: dot + hyphen-separated lowercase identifier
// (2+ chars to avoid `.a` false positives). Underscore allowed for
// BEM-ish modifiers.
const CLASS_RE = /\.([a-z][a-z0-9-]+(?:--?[a-z0-9-]+)*)\b/g;

for (const file of allFiles) {
  const raw = readFileSync(file, "utf8");
  const liveBody = stripComments(raw);

  // Pass 1: classes anywhere in the live body.
  let m;
  while ((m = CLASS_RE.exec(liveBody)) !== null) {
    existing.add(m[1]);
  }
  CLASS_RE.lastIndex = 0;

  // Pass 2: classes inside any kind of comment.
  // Single-pass per file: scan line-by-line, track whether we're
  // inside a `/* … */` block.
  const lines = raw.split("\n");
  let inBlock = false;
  lines.forEach((line, i) => {
    let comment = "";
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end >= 0) {
        comment += line.slice(0, end);
        inBlock = false;
      } else {
        comment += line;
      }
    }
    const blockStart = line.indexOf("/*");
    if (blockStart >= 0 && !inBlock) {
      const rest = line.slice(blockStart + 2);
      const end = rest.indexOf("*/");
      if (end >= 0) {
        comment += rest.slice(0, end);
      } else {
        comment += rest;
        inBlock = true;
      }
    }
    // Single-line `// …` comment.
    const lineComment = line.match(/(?:^|[^:\\/])\/\/(.*)$/);
    if (lineComment) comment += " " + lineComment[1];

    if (!comment) return;
    let cm;
    while ((cm = CLASS_RE.exec(comment)) !== null) {
      const cls = cm[1];
      if (!inComment.has(cls)) inComment.set(cls, []);
      inComment.get(cls).push({ file: file.replace(ROOT + "/", ""), line: i + 1 });
    }
    CLASS_RE.lastIndex = 0;
  });
}

// ── report ──────────────────────────────────────────────────────

const stale = [];
for (const [cls, refs] of inComment.entries()) {
  if (existing.has(cls)) continue;
  if (ALLOWLIST.has(cls)) continue;
  stale.push({ cls, refs });
}

stale.sort((a, b) => a.cls.localeCompare(b.cls));

if (stale.length === 0) {
  console.log("[stale-refs] OK — no stale CSS class references in comments.");
  process.exit(0);
}

console.log(`[stale-refs] Found ${stale.length} CSS class(es) referenced in`);
console.log("comments but NOT defined or used anywhere in the codebase.");
console.log();
console.log("Fix options: (a) remove the comment if the class is truly gone,");
console.log("(b) update the comment to reference the new class, or (c) add the");
console.log("class to ALLOWLIST in `scripts/audit-stale-refs.mjs` if it's built");
console.log("dynamically and the grep missed it.");
console.log();

for (const { cls, refs } of stale) {
  console.log(`  .${cls}`);
  for (const { file, line } of refs.slice(0, 5)) {
    console.log(`    ${file}:${line}`);
  }
  if (refs.length > 5) {
    console.log(`    … +${refs.length - 5} more`);
  }
}

process.exit(STRICT ? 1 : 0);
