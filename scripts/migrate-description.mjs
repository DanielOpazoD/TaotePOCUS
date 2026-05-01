#!/usr/bin/env node
//
// One-off migration: collapse `findings` / `summary` / `diagnosis` on
// every case in `lib/imported-cases.ts` into a single canonical
// `description` field. Implements step 4 of ADR-0008's removal plan.
//
// Usage:
//   node scripts/migrate-description.mjs
//
// Safe to run multiple times — if `description` is already present
// the script leaves the case alone.
//
// What happens per case:
//   - `findings: "..."`  → renamed to `description: "..."`. Single-line
//                          and multi-line (when prettier broke a long
//                          string onto continuation lines) both work.
//   - `summary: "..."`   → DELETED (with continuation lines).
//   - `diagnosis: "..."` → DELETED (with continuation lines).
//
// Why findings → description (not summary / diagnosis): in this
// corpus `findings` is the longest, richest text; the import script
// writes summary as a short label and diagnosis as a single-noun
// label. Picking findings preserves the most content. Per ADR-0008.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = join(HERE, "..", "lib", "imported-cases.ts");

/**
 * Decide whether a value continuation line belongs to the previous
 * field. The value sits at deeper indentation than the field key.
 * Stop when we hit a line at the key's indent or shallower (sibling
 * field, closing brace, blank line, etc.).
 */
function indentOf(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

async function main() {
  const original = await readFile(TARGET, "utf8");
  const lines = original.split("\n");
  const out = [];

  let renamedCount = 0;
  let droppedCount = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // ─── findings: rename to description ──────────────────────
    // Single-line form: `    findings: "value",`
    const findingsSingle = line.match(/^(\s+)findings:\s*(.+)$/);
    if (findingsSingle) {
      out.push(`${findingsSingle[1]}description: ${findingsSingle[2]}`);
      renamedCount += 1;
      i += 1;
      continue;
    }
    // Multi-line form: prettier put the key on its own line and the
    // value on the next indented line(s). Match the bare key.
    const findingsMulti = line.match(/^(\s+)findings:\s*$/);
    if (findingsMulti) {
      const keyIndent = findingsMulti[1].length;
      out.push(`${findingsMulti[1]}description:`);
      renamedCount += 1;
      i += 1;
      // Copy continuation lines (deeper indent) verbatim. Stop at a
      // sibling field / closing brace / blank line.
      while (i < lines.length && indentOf(lines[i]) > keyIndent) {
        out.push(lines[i]);
        i += 1;
      }
      continue;
    }

    // ─── summary / diagnosis: delete entirely ─────────────────
    // Single-line: `    summary: "...",`
    if (/^\s+(summary|diagnosis):\s*.+$/.test(line)) {
      droppedCount += 1;
      i += 1;
      continue;
    }
    // Multi-line: bare key + continuation lines.
    const dropMulti = line.match(/^(\s+)(summary|diagnosis):\s*$/);
    if (dropMulti) {
      const keyIndent = dropMulti[1].length;
      droppedCount += 1;
      i += 1;
      while (i < lines.length && indentOf(lines[i]) > keyIndent) {
        i += 1;
      }
      continue;
    }

    out.push(line);
    i += 1;
  }

  await writeFile(TARGET, out.join("\n"), "utf8");

  console.log(
    `[migrate-description] renamed ${renamedCount} \`findings\` → \`description\`, ` +
      `dropped ${droppedCount} \`summary\`+\`diagnosis\` lines.`,
  );
  if (renamedCount === 0) {
    console.warn(
      "[migrate-description] No `findings` lines were touched. " +
        "Did the migration already run? File is unchanged.",
    );
  }
}

main().catch((err) => {
  console.error("[migrate-description] error:", err);
  process.exit(1);
});
