#!/usr/bin/env node
// Bundle size budget. Run after `next build` to fail CI when the
// production JS payload exceeds a threshold. Replaces an external tool
// (size-limit, bundlesize) with ~80 lines that read the build output
// directly and apply two budget rules.
//
// Usage:
//   node scripts/bundle-budget.mjs
//
// To regenerate the budget after an intentional change, run:
//   node scripts/bundle-budget.mjs --update
// then commit the updated `bundle-budget.json`.
//
// Two metrics, two failure modes:
//
//   - `rootBundleKB` — the JS that ships on EVERY route (root chunks
//     + polyfills, parsed from `.next/build-manifest.json`). This is
//     the first-paint budget; growing it slows every page. Code-
//     splitting an on-demand chunk shrinks this without affecting
//     total bytes.
//   - `totalChunksKB` — sum of every JS chunk in `.next/static/chunks`.
//     Includes lazy chunks. Tracks "are we hoarding code on disk that
//     we never trim". A growing total without a growing root is
//     usually fine (more lazy features) but worth noting.
//
// Each metric has its own 10% slack. CI fails if either rule trips.

import { readdir, stat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const CHUNKS_DIR = join(ROOT, ".next/static/chunks");
const BUILD_MANIFEST = join(ROOT, ".next/build-manifest.json");
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

/**
 * Sum the bytes of the root-level JS bundle: everything Next.js lists
 * in `rootMainFiles` + `polyfillFiles`. That's what the browser
 * downloads before any route-specific code, so it's the metric that
 * code-splitting is actually meant to shrink.
 *
 * Returns `null` when the manifest is absent or shaped unexpectedly —
 * the caller logs a warning and falls back to the total-only check.
 */
async function rootBundleSize() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(BUILD_MANIFEST, "utf8"));
  } catch {
    return null;
  }
  const list = [...(manifest.rootMainFiles ?? []), ...(manifest.polyfillFiles ?? [])];
  if (list.length === 0) return null;
  let total = 0;
  for (const rel of list) {
    const path = join(ROOT, ".next", rel);
    try {
      const s = await stat(path);
      total += s.size;
    } catch {
      // Skip files the manifest references but the disk doesn't have
      // — happens with build modes that emit pseudo-entries.
    }
  }
  return total;
}

function checkRule(label, current, baseline) {
  const max = baseline * (1 + TOLERANCE);
  const ok = current <= max;
  const status = ok ? "✓ within budget" : "✗ over budget";
  console.log(`[budget] ${label}: ${current.toFixed(1)} KB`);
  console.log(
    `[budget]   baseline ${baseline} KB (max +${TOLERANCE * 100}%: ${max.toFixed(1)} KB) ${status}`,
  );
  return ok;
}

async function main() {
  const totalRaw = await dirSize(CHUNKS_DIR);
  const totalKB = +(totalRaw / 1024).toFixed(1);
  const rootRaw = await rootBundleSize();
  const rootKB = rootRaw == null ? null : +(rootRaw / 1024).toFixed(1);

  const update = process.argv.includes("--update");
  let budget;
  try {
    budget = JSON.parse(await readFile(BUDGET_FILE, "utf8"));
  } catch {
    budget = null;
  }

  if (update || !budget) {
    const next = {
      rootBundleKB: rootKB,
      totalChunksKB: totalKB,
      recordedAt: new Date().toISOString(),
    };
    await writeFile(BUDGET_FILE, JSON.stringify(next, null, 2) + "\n");
    console.log(
      `[budget] Saved baseline: rootBundle=${rootKB ?? "—"} KB, totalChunks=${totalKB} KB`,
    );
    return;
  }

  let pass = checkRule("totalChunks", totalKB, budget.totalChunksKB);

  // `rootBundleKB` was added later — older budget files won't have it.
  // Skip the check rather than fail on a missing field; running
  // `--update` re-records both numbers.
  if (rootKB == null) {
    console.warn("[budget] rootBundle: manifest unavailable, skipping initial-load check");
  } else if (typeof budget.rootBundleKB === "number") {
    pass = checkRule("rootBundle", rootKB, budget.rootBundleKB) && pass;
  } else {
    console.log(`[budget] rootBundle: ${rootKB} KB (no baseline yet — run with --update)`);
  }

  if (!pass) {
    console.error(
      "\n[budget] FAIL: at least one metric is over budget.\n" +
        "Run `node scripts/bundle-budget.mjs --update` after an intentional addition.",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[budget] error:", err);
  process.exit(2);
});
