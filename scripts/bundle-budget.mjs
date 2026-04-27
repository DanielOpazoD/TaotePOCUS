#!/usr/bin/env node
// Bundle size budget. Run after `next build` to fail CI when the
// production JS payload exceeds a threshold. Replaces an external tool
// (size-limit, bundlesize) with ~50 lines that read the build output
// directly and apply a per-budget rule.
//
// Usage:
//   node scripts/bundle-budget.mjs
//
// To regenerate the budget after an intentional change, run:
//   node scripts/bundle-budget.mjs --update
// then commit the updated `bundle-budget.json`.

import { readdir, stat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const CHUNKS_DIR = join(ROOT, ".next/static/chunks");
const BUDGET_FILE = join(ROOT, "bundle-budget.json");

// 10% slack so a one-byte addition doesn't break CI; intentional
// growth requires a deliberate `--update`.
const TOLERANCE = 0.1;

async function dirSize(dir) {
  let total = 0;
  const files = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const f of files) {
    if (!f.isFile() || !f.name.endsWith(".js")) continue;
    const path = join(f.parentPath ?? dir, f.name);
    const s = await stat(path);
    total += s.size;
  }
  return total;
}

async function main() {
  const totalRaw = await dirSize(CHUNKS_DIR);
  const totalKB = +(totalRaw / 1024).toFixed(1);

  const update = process.argv.includes("--update");
  let budget;
  try {
    budget = JSON.parse(await readFile(BUDGET_FILE, "utf8"));
  } catch {
    budget = null;
  }

  if (update || !budget) {
    const next = { totalChunksKB: totalKB, recordedAt: new Date().toISOString() };
    await writeFile(BUDGET_FILE, JSON.stringify(next, null, 2) + "\n");
    console.log(`[budget] Saved baseline: total chunks = ${totalKB} KB raw`);
    return;
  }

  const max = budget.totalChunksKB * (1 + TOLERANCE);
  const status = totalKB <= max ? "✓ within budget" : "✗ over budget";
  console.log(`[budget] total chunks: ${totalKB} KB`);
  console.log(
    `[budget] baseline:     ${budget.totalChunksKB} KB (max +${TOLERANCE * 100}%: ${max.toFixed(1)} KB)`,
  );
  console.log(`[budget] ${status}`);

  if (totalKB > max) {
    console.error(
      `\n[budget] FAIL: bundle grew by ${((totalKB / budget.totalChunksKB - 1) * 100).toFixed(1)}%.\n` +
        `Run \`node scripts/bundle-budget.mjs --update\` after an intentional addition.`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[budget] error:", err);
  process.exit(2);
});
