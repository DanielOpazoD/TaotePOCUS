#!/usr/bin/env node
// =================== COVERAGE DELTA GATE ===================
//
// Per-PR forcing function against silent coverage drift in `lib/**`.
//
// The story (May-2026): the absolute thresholds in `vitest.config.ts`
// (statements 92 / branches 84 / functions 95 / lines 95) catch
// CATASTROPHIC regressions but tolerate the slow grind. Between
// April and May, lib/** coverage drifted 7pp downward — every PR
// that landed new feature code added uncovered branches just under
// the absolute floor, so each PR passed CI individually. By the
// time the floor cracked (PR #131), 20+ unrelated PRs had merged
// over the slow leak.
//
// This script flips the contract: instead of "stay above N%", every
// PR has to "not drop below main by more than 0.5pp on any metric."
// Adding code is fine. Adding code WITHOUT TESTS is not.
//
// Behavior:
//   - Reads PR coverage from `coverage/coverage-summary.json`.
//   - Reads main baseline from `.coverage-baseline/coverage-summary.json`
//     (downloaded as a workflow artifact in CI — see ci.yml).
//   - Computes the lib/** aggregate from per-file entries (matches
//     vitest's threshold key `lib/**`).
//   - Compares each of {statements, branches, functions, lines}.
//   - If ANY drops > 0.5pp, exits 1 with a clear actionable message.
//   - If the baseline file is missing (first run, or main artifact
//     expired), exits 0 with a one-line note — the absolute
//     thresholds in vitest config still catch hard regressions, so
//     missing-baseline isn't a blocker.
//
// CLI:
//   node scripts/coverage-delta.mjs
//     [--current coverage/coverage-summary.json]
//     [--baseline .coverage-baseline/coverage-summary.json]
//     [--threshold 0.5]
//
// Exit codes:
//   0  — passed (no drop > threshold) OR baseline missing
//   1  — at least one metric dropped > threshold
//   2  — script error (bad input, file parse failure)

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULTS = {
  current: "coverage/coverage-summary.json",
  baseline: ".coverage-baseline/coverage-summary.json",
  threshold: 0.5, // percentage points
};

function parseArgs(argv) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]?.replace(/^--/, "");
    const v = argv[i + 1];
    if (k in out && v !== undefined) {
      out[k] = k === "threshold" ? Number(v) : v;
    }
  }
  return out;
}

/** Aggregate the lib/** entries in a coverage-summary into one set of
 *  totals. The `total` key already gives an everything-included
 *  aggregate; we recompute over `lib/**` so the gate matches the
 *  same surface the vitest threshold targets (see `vitest.config.ts`
 *  → `thresholds: { "lib/**": ... }`). */
function aggregateLib(summary) {
  // Per-file keys are absolute paths. Match any segment that includes
  // `/lib/` so the path-resolution differences between the CI runner
  // (relative paths, like `lib/foo.ts`) and a local mac (absolute,
  // `/Users/.../POCUS/lib/foo.ts`) don't matter.
  const libKeys = Object.keys(summary).filter((k) => k !== "total" && /(?:^|\/)lib\//.test(k));
  if (libKeys.length === 0) {
    throw new Error(
      "No `lib/**` entries found in coverage summary — vitest config probably " +
        "doesn't `include` lib (or the run produced no coverage).",
    );
  }
  const metrics = ["statements", "branches", "functions", "lines"];
  const out = {};
  for (const m of metrics) {
    let covered = 0;
    let total = 0;
    for (const k of libKeys) {
      covered += summary[k][m].covered;
      total += summary[k][m].total;
    }
    out[m] = total === 0 ? 100 : (100 * covered) / total;
  }
  return out;
}

async function readSummary(path) {
  const abs = resolve(process.cwd(), path);
  const raw = await readFile(abs, "utf8");
  return JSON.parse(raw);
}

function fmt(pct) {
  return `${pct.toFixed(2)}%`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(args.current)) {
    console.error(`[coverage-delta] current report not found: ${args.current}`);
    console.error(`[coverage-delta] Did you run \`npm run test:coverage\` first?`);
    process.exit(2);
  }

  if (!existsSync(args.baseline)) {
    // No baseline yet — first run on a new branch, or the artifact
    // from main expired. Don't block; the absolute thresholds still
    // catch hard regressions.
    console.log(
      `[coverage-delta] baseline not present at ${args.baseline} — ` +
        `skipping delta check (absolute thresholds still apply via vitest).`,
    );
    process.exit(0);
  }

  let current, baseline;
  try {
    current = aggregateLib(await readSummary(args.current));
  } catch (err) {
    console.error(`[coverage-delta] failed to read current report: ${err.message}`);
    process.exit(2);
  }
  try {
    baseline = aggregateLib(await readSummary(args.baseline));
  } catch (err) {
    console.error(`[coverage-delta] failed to read baseline: ${err.message}`);
    console.error(`[coverage-delta] treating as missing — skipping delta check.`);
    process.exit(0);
  }

  const metrics = ["statements", "branches", "functions", "lines"];
  const offenders = [];
  for (const m of metrics) {
    const delta = current[m] - baseline[m];
    if (delta < -args.threshold) {
      offenders.push({ metric: m, baseline: baseline[m], current: current[m], delta });
    }
  }

  // Summary table — always print, regardless of outcome. Surfaces the
  // numbers in the CI job log so reviewers see whether a PR drifted
  // even when it stayed under the threshold.
  console.log("\n[coverage-delta] lib/** coverage delta vs main:");
  console.log("");
  console.log("  metric      | baseline | current  | delta");
  console.log("  ------------|----------|----------|--------");
  for (const m of metrics) {
    const d = current[m] - baseline[m];
    const sign = d >= 0 ? "+" : "";
    const flag = d < -args.threshold ? " ✗" : "";
    console.log(
      `  ${m.padEnd(11)} | ${fmt(baseline[m]).padStart(8)} | ${fmt(current[m]).padStart(8)} | ${sign}${d.toFixed(2)}pp${flag}`,
    );
  }
  console.log("");

  if (offenders.length === 0) {
    console.log(`[coverage-delta] OK — no metric dropped more than ${args.threshold}pp.`);
    process.exit(0);
  }

  console.error(
    `[coverage-delta] FAIL — coverage regressed beyond the ${args.threshold}pp threshold on:`,
  );
  for (const o of offenders) {
    console.error(
      `  - ${o.metric}: ${fmt(o.baseline)} → ${fmt(o.current)} (${o.delta.toFixed(2)}pp)`,
    );
  }
  console.error("");
  console.error("[coverage-delta] To fix:");
  console.error("  1. Add tests for the new code that's pulling coverage down.");
  console.error("  2. OR, if the new code is genuinely integration-only (browser");
  console.error("     APIs, ServiceWorker bridges, SDK adapters), exclude it in");
  console.error("     `vitest.config.ts` with a doc comment explaining why.");
  console.error("  3. OR, if this PR removed test files that covered code which");
  console.error("     itself wasn't removed, add the tests back.");
  process.exit(1);
}

main().catch((err) => {
  console.error(`[coverage-delta] unexpected error: ${err?.stack || err}`);
  process.exit(2);
});
