#!/usr/bin/env node
// =================== ADR GATE ===================
//
// PR-level forcing function: any change that touches the architectural
// surface of the app MUST either ship with a new ADR (Architecture
// Decision Record) under `docs/adr/`, or carry a `[skip-adr]` token in
// the PR body with a one-line justification.
//
// The intent isn't bureaucracy. It's that we already have 14 ADRs
// (`docs/adr/0001-0014`) documenting non-obvious decisions, and the
// codebase visibly benefits from them — every audit lands one in the
// face of "wait, why is the dual-write structured this way?" The gate
// makes ADRs a habit instead of an aspiration: when the next refactor
// rewires the data layer, the decision lands in the same place every
// previous one did.
//
// Architectural paths (touching ANY triggers the gate):
//
//   - lib/repo/**           data layer (the facade + dual-write)
//   - lib/server/**         server-side critical (session resolution)
//   - lib/ai/registry.ts    AI provider contract
//   - lib/ai/provider.ts    same
//   - lib/storage-migrations.ts  on-disk schema migrations
//   - lib/env.ts            runtime config + feature flags
//   - lib/schemas/api/**    wire contracts (NEW — added with the zod
//                           PR; any change here is a wire-shape change)
//   - lib/schemas.ts        corpus validators
//   - app/api/**            HTTP API surface
//   - proxy.ts              Next.js middleware
//   - next.config.mjs       build / runtime config
//   - eslint.config.mjs     code rules (boundaries, no-restricted-imports)
//   - vitest.config.ts      test runner + coverage thresholds
//   - tsconfig.json         compiler strictness
//   - .github/workflows/ci.yml   the CI gate itself
//
// Explicitly NOT architectural:
//
//   - tests/**, e2e/**           tests are not decisions, they pin them
//   - components/**, hooks/**    UI is not a decision; if a NEW pattern
//                                 emerges that we want to spread, write
//                                 the ADR proactively
//   - app/(routes)/*/page.tsx    a new route is a feature, not a
//                                 decision (unless it changes the
//                                 routing model, which would touch
//                                 next.config.mjs)
//   - app/styles/**, css         styles are not decisions
//   - scripts/**                 build-time tooling
//   - public/**, docs/**         assets + docs
//
// Skip token: `[skip-adr]` anywhere in the PR body. Convention is to
// follow it with a one-line reason (`[skip-adr]: revert of #134`).
// The token is a safety valve, not a default — using it for every
// PR defeats the gate.
//
// CLI:
//   node scripts/check-adr-gate.mjs --base <sha> [--body-file <path>]
//
// Inputs:
//   --base       The base SHA to diff against (typically `origin/main`).
//   --body-file  Path to a file containing the PR body text. The
//                workflow writes `${{ github.event.pull_request.body }}`
//                to a temp file (env vars get mangled by the YAML
//                parser for multiline bodies — file IO is safer).
//                Optional; if absent, the script treats the body as
//                empty (no skip token).
//
// Exit codes:
//   0  — gate passed (no architectural changes OR ADR present OR skip
//        token present)
//   1  — gate failed (architectural changes without ADR or skip)
//   2  — script / git error

import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ARCHITECTURAL_PATHS = [
  /^lib\/repo\//,
  /^lib\/server\//,
  /^lib\/ai\/registry\.ts$/,
  /^lib\/ai\/provider\.ts$/,
  /^lib\/storage-migrations\.ts$/,
  /^lib\/env\.ts$/,
  /^lib\/schemas\/api\//,
  /^lib\/schemas\.ts$/,
  /^app\/api\//,
  /^proxy\.ts$/,
  /^next\.config\.mjs$/,
  /^eslint\.config\.mjs$/,
  /^vitest\.config\.ts$/,
  /^tsconfig\.json$/,
  /^\.github\/workflows\/ci\.yml$/,
];

const ADR_NEW_FILE = /^docs\/adr\/\d{4}-[a-z0-9-]+\.md$/;
const ADR_INDEX = /^docs\/adr\/README\.md$/;
const SKIP_TOKEN = /\[skip-adr\]/i;

function parseArgs(argv) {
  const out = { base: "", bodyFile: "" };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]?.replace(/^--/, "");
    const v = argv[i + 1];
    if (k === "base" && v) out.base = v;
    else if (k === "body-file" && v) out.bodyFile = v;
  }
  return out;
}

function diffFiles(base) {
  // Two-arg form (no dots) compares the two endpoint trees DIRECTLY
  // — no merge base required. This matters in CI where the default
  // `actions/checkout` is shallow (depth=1) and the merge base
  // between origin/main and HEAD may live in unfetched history.
  // The three-dot form (`origin/main...HEAD`) needs the merge base
  // and fails with "fatal: no merge base" on shallow clones.
  //
  // The downside of the two-arg form: if main has commits unrelated
  // to this PR's branch, they show up as differences too. For our
  // use case (does this PR touch architectural paths?) that's a
  // false-positive cost we'd rather pay than risk a false negative
  // from a half-fetched merge base.
  try {
    const out = execSync(`git diff --name-only ${base} HEAD`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out.split("\n").filter(Boolean);
  } catch (err) {
    console.error(`[adr-gate] git diff failed: ${err.message}`);
    process.exit(2);
  }
}

function readBody(path) {
  if (!path) return "";
  if (!existsSync(path)) return "";
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.base) {
    console.error("[adr-gate] --base <sha> is required");
    process.exit(2);
  }

  const changed = diffFiles(args.base);
  if (changed.length === 0) {
    console.log("[adr-gate] no changed files vs base — nothing to check.");
    process.exit(0);
  }

  // Did this PR add a new ADR file? Index updates alone don't count
  // (a contributor might add the row before writing the file); we
  // need the actual 00NN-slug.md to exist in the diff.
  const newAdr = changed.find((p) => ADR_NEW_FILE.test(p));
  const touchedIndex = changed.some((p) => ADR_INDEX.test(p));

  // Which architectural paths did this PR touch?
  const touched = changed.filter((p) => ARCHITECTURAL_PATHS.some((rx) => rx.test(p)));

  // Body skip token?
  const body = readBody(args.bodyFile);
  const skipMatch = body.match(SKIP_TOKEN);

  // ─── Decision matrix ───────────────────────────────────────────
  // Print the inputs for transparency in CI logs — reviewers can
  // verify the gate's reasoning without re-running locally.
  console.log("[adr-gate] diff summary:");
  console.log(`  changed files:        ${changed.length}`);
  console.log(`  architectural paths:  ${touched.length}`);
  if (touched.length > 0) {
    for (const p of touched.slice(0, 10)) console.log(`    - ${p}`);
    if (touched.length > 10) console.log(`    … (${touched.length - 10} more)`);
  }
  console.log(`  new ADR file:         ${newAdr ?? "(none)"}`);
  console.log(`  ADR index touched:    ${touchedIndex ? "yes" : "no"}`);
  console.log(`  skip-adr in body:     ${skipMatch ? "yes" : "no"}`);
  console.log("");

  if (touched.length === 0) {
    console.log("[adr-gate] OK — no architectural paths touched.");
    process.exit(0);
  }

  if (newAdr) {
    console.log(`[adr-gate] OK — new ADR present (${newAdr}).`);
    // Soft nudge: an ADR without an index update will look like an
    // orphan in `docs/adr/README.md`. We don't FAIL on this — adding
    // the index row is a one-line follow-up — but we warn so it
    // gets noticed.
    if (!touchedIndex) {
      console.log(
        "[adr-gate] note: docs/adr/README.md not touched. Add the new ADR to the index table when convenient.",
      );
    }
    process.exit(0);
  }

  if (skipMatch) {
    console.log("[adr-gate] OK — `[skip-adr]` token present in PR body.");
    console.log("           If this PR really changes architecture, write the");
    console.log("           ADR before merge. The skip is a safety valve, not");
    console.log("           a default.");
    process.exit(0);
  }

  // ─── Fail path ───────────────────────────────────────────────
  console.error("[adr-gate] FAIL — architectural changes without an ADR.");
  console.error("");
  console.error("This PR touches paths the project treats as architecture:");
  for (const p of touched) console.error(`  - ${p}`);
  console.error("");
  console.error("Pick one of these to unblock the gate:");
  console.error("");
  console.error("  1. Add an ADR. Copy `docs/adr/template.md` to");
  console.error("     `docs/adr/<NNNN>-<slug>.md`, fill it in, commit. The");
  console.error("     existing ADRs are short — usually under 100 lines.");
  console.error("");
  console.error("  2. If this is genuinely not an architecture change");
  console.error("     (e.g. a typo fix in a route handler, an env-var");
  console.error("     rename that doesn't change semantics, a refactor");
  console.error("     that preserves the contract), add `[skip-adr]` to");
  console.error("     the PR body with a one-line reason.");
  console.error("");
  console.error("See `docs/adr/README.md` for the project's ADR format.");
  process.exit(1);
}

main();
