#!/usr/bin/env node
// One-shot migration: upload everything in `public/imports/` to the
// Netlify Blobs store named `imports`.
//
//   $ node scripts/upload-media-to-blobs.mjs
//
// Idempotent: lists the existing keys first and skips any that are
// already present, so re-runs are safe and cheap. After a successful
// run, `app/api/media/[id]` will serve every imported case's media
// from the blob store, and the `public/imports/` folder can stay
// gitignored.
//
// Auth resolution (in order):
//
//   1. `NETLIFY_BLOBS_CONTEXT` env var (auto-set inside Netlify
//      Functions / `netlify dev`; nothing else to do).
//   2. `NETLIFY_SITE_ID` + `NETLIFY_AUTH_TOKEN` env vars (explicit
//      override — useful for CI runs).
//   3. `~/.netlify/config.json` (where `netlify login` writes the
//      token) combined with the project ID from `.netlify/state.json`.
//
// Run from the project root so the relative path to `public/imports`
// resolves. The script never deletes blobs — even if a local file is
// removed, the corresponding blob stays. That's intentional: the
// Twitter import is append-only and we don't want stale runs to
// nuke older cases.

import { getStore } from "@netlify/blobs";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const STORE_NAME = "imports";
const LOCAL_DIR = "public/imports";
// Blobs hard cap per object — we never get close (Twitter media tops
// out around 5 MB) but we still skip anything larger to surface a
// clear error rather than letting the SDK reject mid-batch.
const MAX_BYTES = 5 * 1024 * 1024 * 1024;

function readJsonIfExists(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function resolveAuth() {
  // 1. Already inside a Netlify runtime — let the SDK self-configure.
  if (process.env.NETLIFY_BLOBS_CONTEXT) {
    return {};
  }

  // 2. Explicit env override.
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    return {
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN,
    };
  }

  // 3. Auto-discover from `netlify login` config.
  const cliConfig = readJsonIfExists(join(homedir(), ".netlify", "config.json"));
  const projectState = readJsonIfExists(join(process.cwd(), ".netlify", "state.json"));
  const userId = cliConfig?.userId;
  const token = userId ? cliConfig?.users?.[userId]?.auth?.token : null;
  const siteID = projectState?.siteId;

  if (token && siteID) {
    return { siteID, token };
  }

  console.error("Could not resolve Netlify auth.");
  console.error("Try one of:");
  console.error("  • `netlify login` then re-run this script");
  console.error("  • Set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN env vars");
  process.exit(1);
}

async function main() {
  if (!existsSync(LOCAL_DIR)) {
    console.error(`Directory ${LOCAL_DIR} not found. Run the import script first.`);
    process.exit(1);
  }

  const auth = resolveAuth();
  const store = getStore(STORE_NAME, auth);

  // List existing keys for idempotency. The `paginate` flag returns
  // an async iterator of pages; each page has a small `blobs` array
  // we accumulate into a Set for O(1) lookup.
  console.log("Checking existing blobs in the store...");
  const existing = new Set();
  for await (const page of store.list({ paginate: true })) {
    for (const blob of page.blobs) existing.add(blob.key);
  }
  console.log(`  → ${existing.size} key(s) already in the store.`);

  const files = readdirSync(LOCAL_DIR).filter((f) => !f.startsWith("."));
  console.log(`Local files in ${LOCAL_DIR}: ${files.length}`);

  let uploaded = 0;
  let skipped = 0;
  let oversized = 0;
  let failed = 0;

  for (const [i, file] of files.entries()) {
    const key = file; // file name IS the key (case id with extension)
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }

    const path = join(LOCAL_DIR, file);
    const size = statSync(path).size;
    if (size > MAX_BYTES) {
      console.warn(`  ⚠ ${key} is ${size} B (>${MAX_BYTES}); skipping`);
      oversized += 1;
      continue;
    }

    try {
      const data = readFileSync(path);
      await store.set(key, data);
      uploaded += 1;
      // Periodic progress so the operator knows the script is alive
      // when running over a slow connection.
      if (uploaded % 10 === 0 || i === files.length - 1) {
        const pct = (((i + 1) / files.length) * 100).toFixed(1);
        console.log(`  ↑ ${uploaded} uploaded · ${i + 1}/${files.length} (${pct}%)`);
      }
    } catch (err) {
      console.error(`  ✗ ${key} failed:`, err.message);
      failed += 1;
    }
  }

  console.log("");
  console.log("─── Summary ───");
  console.log(`Uploaded:  ${uploaded}`);
  console.log(`Skipped:   ${skipped} (already in store)`);
  console.log(`Oversized: ${oversized}`);
  console.log(`Failed:    ${failed}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
