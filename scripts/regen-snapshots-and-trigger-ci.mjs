#!/usr/bin/env node
// Snapshot-regeneration dance, packed into one CLI.
//
// What it solves
// ──────────────
// CSS / visual changes drift the Playwright snapshots on both
// Darwin (your laptop) and Linux (CI runner). The full dance was:
//
//   1. Run `npx playwright test e2e/visual.spec.ts --update-snapshots`
//      locally to refresh Darwin baselines.
//   2. Commit + push.
//   3. Manually dispatch the `regenerate-visual-snapshots.yml`
//      workflow against the branch:
//         gh workflow run regenerate-visual-snapshots.yml --ref <branch>
//   4. Wait ~2 min for the workflow to finish and push the Linux
//      baselines to the branch (as github-actions[bot]).
//   5. Pull the new commit locally: `git pull --rebase`.
//   6. Push an empty commit so the main CI workflow re-runs on the
//      bot-pushed baselines (GitHub Actions skips triggers from
//      bot commits by default):
//         git commit --allow-empty -m "ci: trigger after Linux regen"
//
// That's 6 steps × ~5 min of wall time per visual PR. This script
// reduces it to one command + ~3 min of polling.
//
// Usage
// ─────
//   node scripts/regen-snapshots-and-trigger-ci.mjs [--skip-darwin]
//
// Flags:
//   --skip-darwin   Skip the local `--update-snapshots` step. Useful
//                   when you've already regenerated Darwin baselines
//                   in a previous run and only need to trigger Linux.
//   --skip-trigger  Skip the empty trigger commit at the end. Useful
//                   when you'll be pushing another real commit anyway.
//
// Requires
// ────────
//   - `gh` CLI installed and authenticated (`gh auth status` must pass).
//   - You must be on a feature branch with upstream tracking
//     (i.e., already pushed at least once).
//   - The `regenerate-visual-snapshots.yml` workflow must exist.
//
// Failure modes
// ─────────────
//   - On main/master: refuses to run (regenerated baselines on main
//     bypass review).
//   - No upstream: prints the `git push -u` command you need.
//   - Workflow not found / fails: surfaces the gh output + exits 1.

import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const ARGS = new Set(process.argv.slice(2));
const SKIP_DARWIN = ARGS.has("--skip-darwin");
const SKIP_TRIGGER = ARGS.has("--skip-trigger");
const WORKFLOW = "regenerate-visual-snapshots.yml";

// ── helpers ─────────────────────────────────────────────────────

function run(cmd, args, { quiet = false } = {}) {
  const res = spawnSync(cmd, args, {
    stdio: quiet ? "pipe" : "inherit",
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(`\`${cmd} ${args.join(" ")}\` exited with ${res.status}\n${res.stderr ?? ""}`);
  }
  return res.stdout?.trim() ?? "";
}

function tryRun(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "pipe", encoding: "utf8" });
  return { ok: res.status === 0, out: res.stdout?.trim() ?? "", err: res.stderr?.trim() ?? "" };
}

// ── safety checks ───────────────────────────────────────────────

const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { quiet: true });
if (branch === "main" || branch === "master") {
  console.error(
    `[regen] Refusing to regenerate baselines on '${branch}'. ` + `Create a feature branch first.`,
  );
  process.exit(1);
}

const upstream = tryRun("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
if (!upstream.ok) {
  console.error(
    `[regen] Branch '${branch}' has no upstream. Push it first:\n` +
      `  git push -u origin ${branch}`,
  );
  process.exit(1);
}

const ghAuth = tryRun("gh", ["auth", "status"]);
if (!ghAuth.ok) {
  console.error(`[regen] \`gh\` is not authenticated. Run \`gh auth login\` first.`);
  process.exit(1);
}

// ── step 1: Darwin baselines ────────────────────────────────────

if (!SKIP_DARWIN) {
  console.log("[regen] Step 1/4: regenerating Darwin baselines locally…");
  run("npx", ["playwright", "test", "e2e/visual.spec.ts", "--update-snapshots"]);
  const status = run("git", ["status", "--short"], { quiet: true });
  if (status.length > 0) {
    console.log("[regen] Committing Darwin baseline updates…");
    run("git", ["add", "e2e/visual.spec.ts-snapshots/"]);
    run("git", ["commit", "-m", "test(visual): regenerate Darwin baselines"]);
    run("git", ["push"]);
  } else {
    console.log("[regen] No Darwin baseline changes — moving on.");
  }
} else {
  console.log("[regen] Step 1/4: skipped Darwin regen (per --skip-darwin)");
}

// ── step 2: trigger Linux workflow ──────────────────────────────

console.log(`[regen] Step 2/4: dispatching '${WORKFLOW}' against '${branch}'…`);
run("gh", ["workflow", "run", WORKFLOW, "--ref", branch]);

// ── step 3: poll until completion ───────────────────────────────

console.log("[regen] Step 3/4: polling workflow until it completes (max ~4 min)…");
const start = Date.now();
const TIMEOUT_MS = 4 * 60 * 1000;
let runId = null;
let runStatus = "queued";

// First, find the most recent run for this branch + workflow.
// The dispatch above can take a moment to register, so retry up
// to 30 s for the run to appear.
for (let i = 0; i < 15; i++) {
  await sleep(2000);
  const res = tryRun("gh", [
    "run",
    "list",
    "--workflow",
    WORKFLOW,
    "--branch",
    branch,
    "--limit",
    "1",
    "--json",
    "databaseId,status,conclusion",
  ]);
  if (!res.ok) continue;
  try {
    const parsed = JSON.parse(res.out);
    if (parsed[0]?.databaseId) {
      runId = parsed[0].databaseId;
      runStatus = parsed[0].status;
      break;
    }
  } catch {
    /* keep trying */
  }
}

if (!runId) {
  console.error("[regen] Could not find the dispatched run after 30 s. Bail.");
  process.exit(1);
}

console.log(`[regen]   Tracking run ${runId}…`);
while (runStatus !== "completed" && Date.now() - start < TIMEOUT_MS) {
  await sleep(5000);
  const res = tryRun("gh", ["run", "view", String(runId), "--json", "status,conclusion"]);
  if (!res.ok) continue;
  try {
    const parsed = JSON.parse(res.out);
    runStatus = parsed.status;
    if (runStatus === "completed") {
      console.log(`[regen]   Run completed with conclusion: ${parsed.conclusion}`);
      if (parsed.conclusion !== "success") {
        console.error(`[regen] Workflow did not succeed. Open it:`);
        console.error(
          `  https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions/runs/${runId}`,
        );
        process.exit(1);
      }
    }
  } catch {
    /* keep polling */
  }
}

if (runStatus !== "completed") {
  console.error("[regen] Workflow didn't complete within 4 minutes. Check it manually.");
  process.exit(1);
}

// ── step 4: pull bot commit + trigger CI ────────────────────────

console.log("[regen] Step 4/4: pulling bot-pushed baselines…");
run("git", ["pull", "--rebase"]);

if (!SKIP_TRIGGER) {
  console.log("[regen] Pushing empty commit to retrigger main CI…");
  run("git", ["commit", "--allow-empty", "-m", "ci: trigger after Linux baseline regen"]);
  run("git", ["push"]);
}

console.log("[regen] Done. Main CI should pick up the new baselines now.");
