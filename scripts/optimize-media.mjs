#!/usr/bin/env node
// Generate AVIF + WebP variants for every importable image in the
// Netlify Blobs `imports` store. The route at /api/media/<id> picks
// the best variant for each request based on the Accept header, so
// modern browsers get AVIF (~40-60% smaller than the source JPG),
// older WebKit gets WebP, and everything else falls back to the
// original. The catalog's `<Image src="/api/media/...">` URLs DO NOT
// CHANGE — negotiation happens server-side.
//
//   $ node scripts/optimize-media.mjs               # full pass
//   $ node scripts/optimize-media.mjs --dry-run     # preview only
//   $ node scripts/optimize-media.mjs --prefix=tw-  # filter keys
//   $ node scripts/optimize-media.mjs --force       # regenerate
//                                                     existing
//                                                     variants
//
// Idempotent: skips a target variant if it already exists in the
// store (use --force to override). Re-runs are safe and cheap.
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
// Pipeline (in order, applied to every source image):
//
//   1. .rotate()                       — auto-orient from EXIF tags.
//      Twitter exports sometimes carry EXIF rotation (camera-captured
//      stills, especially); without this step the AVIF/WebP variants
//      bake the wrong orientation while the source JPG renders
//      correctly in browser (browsers honor EXIF). Free defensive fix.
//
//   2. .resize({ width: 1600, ... })   — cap the source size.
//      Largest catalog surface (modal/presentation full-screen) tops
//      out around 1280px on a typical laptop, 1600px on retina XL.
//      Source JPGs from Twitter are routinely 1920×1080+. Capping at
//      1600 saves another 30-40% bytes on big sources at zero visible
//      quality cost — the browser was downscaling already.
//      `withoutEnlargement` ensures we never upscale a smaller source.
//
//   3. AVIF q=60, effort=6             — visually identical to the
//      JPG source in side-by-side review for POCUS imagery (low-
//      frequency content, no fine type). effort=6 trades 2× encode
//      wall time for ~5-8% more compression vs default 4 — worth it
//      for a one-time build pass that lives 1 year in the CDN cache.
//
//   4. WebP q=75                       — Safari < 16 / older Chromium
//      fallback. Slightly higher quality target than AVIF because
//      WebP's lossy ringing shows up sooner on medical imagery.
//
// Encoding runs with concurrency=CONCURRENCY across the source list
// (each unit of work is one IMAGE — both its variants encode in
// series so the source decode happens once per image). At ~600ms per
// AVIF encode the difference between serial and parallel is the
// difference between a 2-minute pass and a 30-second pass.
//
// Original keys are NEVER deleted — variants live alongside as
// `<base>.avif` / `<base>.webp`.

import { getStore } from "@netlify/blobs";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const STORE = "imports";
const OPTIMIZABLE_EXTS = new Set([".jpg", ".jpeg", ".png"]);

/** Source dimension cap. Largest rendering surface is the
 *  presentation cinema at full-screen (~1280px on a laptop, ~1600px
 *  on retina XL). Sources above this get downscaled at encode time
 *  so we never store more pixels than any consumer can display. */
const MAX_WIDTH = 1600;

/** Image-level concurrency for the outer loop. Each unit is one
 *  source image — both AVIF + WebP encode for that image happen
 *  serially inside the unit so the source buffer decodes once. Sharp
 *  itself uses libvips under the hood with its own thread pool, so
 *  going much above 4 doesn't help in practice. */
const CONCURRENCY = 4;

const TARGETS = [
  {
    ext: ".avif",
    label: "AVIF",
    encode: (s) => s.avif({ quality: 60, effort: 6 }),
  },
  {
    ext: ".webp",
    label: "WebP",
    encode: (s) => s.webp({ quality: 75 }),
  },
];

/**
 * Build the shared decode pipeline. `.rotate()` reads the EXIF
 * orientation tag and applies it permanently; subsequent encodes
 * are guaranteed orientation-correct. `.resize()` caps the longest
 * edge at MAX_WIDTH (no upscaling) so we don't store more pixels
 * than anything renders.
 */
function buildPipeline(src) {
  return sharp(src, { failOn: "error" })
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true, fit: "inside" });
}

function resolveAuth() {
  // Auto context (netlify dev / Functions runtime / build hooks).
  if (process.env.NETLIFY_BLOBS_CONTEXT) return undefined;

  // Explicit env override.
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    return {
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN,
    };
  }

  // Local CLI fallback. `netlify login` writes a token here; the
  // project's `.netlify/state.json` carries the site id.
  try {
    const cfgPath = join(homedir(), ".netlify", "config.json");
    const statePath = join(process.cwd(), ".netlify", "state.json");
    if (existsSync(cfgPath) && existsSync(statePath)) {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      const token = cfg?.users?.[Object.keys(cfg?.users ?? {})[0]]?.auth?.token;
      if (token && state?.siteId) return { siteID: state.siteId, token };
    }
  } catch {
    // fall through
  }
  throw new Error(
    "Couldn't resolve Netlify Blobs credentials. Set NETLIFY_BLOBS_CONTEXT (inside `netlify dev`) " +
      "or NETLIFY_SITE_ID + NETLIFY_AUTH_TOKEN, or run `netlify login` first.",
  );
}

function pathExt(key) {
  const m = key.toLowerCase().match(/\.[^./]+$/);
  return m ? m[0] : "";
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function pct(num, total) {
  if (total === 0) return "0%";
  return `${Math.round((num / total) * 100)}%`;
}

/**
 * Process a single source image: load it once, encode each target
 * variant in series (reusing the decoded source via sharp's pipeline).
 * Returns a per-image stats record so the main loop can aggregate.
 *
 * The function is intentionally pure-async-no-shared-state so the
 * outer parallel scheduler can run several of these concurrently
 * without locks.
 */
async function processImage({ store, key, force, dryRun }) {
  const ext = pathExt(key);
  const base = key.slice(0, -ext.length);

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let originalBytes = 0;
  let encodedBytes = 0;

  // Lazy-load the original — only fetch from the store if at least
  // one variant needs encoding. store.get() is the expensive op
  // (round-trip + transfer), so skipping it for already-converted
  // keys is the dominant performance win.
  let originalBuf = null;
  const loadOriginal = async () => {
    if (originalBuf) return originalBuf;
    const ab = await store.get(key, { type: "arrayBuffer" });
    if (!ab) throw new Error(`source vanished: ${key}`);
    originalBuf = Buffer.from(ab);
    return originalBuf;
  };

  for (const target of TARGETS) {
    const targetKey = `${base}${target.ext}`;

    if (!force) {
      const existing = await store.getMetadata(targetKey).catch(() => null);
      if (existing) {
        skipped++;
        continue;
      }
    }

    if (dryRun) {
      console.log(`[dry-run] would generate ${targetKey}`);
      generated++;
      continue;
    }

    try {
      const src = await loadOriginal();
      // Build a fresh sharp pipeline per variant — sharp instances
      // are stateful (calling .avif() then .webp() on the same
      // instance overwrites the output format), so even though the
      // source bytes are reused, the decoded pipeline needs to be
      // re-constructed for each encode.
      const encoded = await target.encode(buildPipeline(src)).toBuffer();
      await store.set(targetKey, encoded);
      const ratio = pct(src.length - encoded.length, src.length);
      console.log(
        `✓ ${targetKey} — ${target.label}, ${formatBytes(encoded.length)} (${ratio} smaller than source)`,
      );
      generated++;
      originalBytes += src.length;
      encodedBytes += encoded.length;
    } catch (err) {
      console.error(`✗ ${targetKey} — encode/upload failed:`, err.message ?? err);
      failed++;
    }
  }

  return { generated, skipped, failed, originalBytes, encodedBytes };
}

/**
 * Bounded-concurrency scheduler. Runs at most `limit` workers in
 * parallel against the queue. Each worker pulls the next item and
 * loops until empty. Cheaper than installing p-limit / similar — the
 * primitive is ~10 lines and the API surface we need is trivial.
 */
async function runWithConcurrency(items, limit, worker) {
  const results = [];
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const prefixArg = process.argv.find((a) => a.startsWith("--prefix="));
  const prefix = prefixArg ? prefixArg.slice("--prefix=".length) : undefined;

  const auth = resolveAuth();
  const store = auth ? getStore({ name: STORE, ...auth }) : getStore(STORE);

  console.log(
    `[optimize-media] Scanning store "${STORE}"${prefix ? ` (prefix: "${prefix}")` : ""}${dryRun ? " [dry-run]" : ""}${force ? " [force]" : ""}`,
  );
  const listing = await store.list(prefix ? { prefix } : undefined);
  const blobs = listing.blobs ?? [];
  console.log(`[optimize-media] Found ${blobs.length} blob(s) total`);

  // Filter down to images we know how to encode — non-images stay
  // in the store unchanged. Doing the filter once up front gives the
  // scheduler a clean list of work units.
  const sources = blobs.filter(({ key }) => OPTIMIZABLE_EXTS.has(pathExt(key)));
  console.log(
    `[optimize-media] ${sources.length} image source(s) to process (concurrency=${CONCURRENCY})`,
  );

  const startedAt = Date.now();
  const perImage = await runWithConcurrency(sources, CONCURRENCY, ({ key }) =>
    processImage({ store, key, force, dryRun }),
  );

  // Aggregate stats across all images.
  const totals = perImage.reduce(
    (acc, r) => ({
      generated: acc.generated + r.generated,
      skipped: acc.skipped + r.skipped,
      failed: acc.failed + r.failed,
      originalBytes: acc.originalBytes + r.originalBytes,
      encodedBytes: acc.encodedBytes + r.encodedBytes,
    }),
    { generated: 0, skipped: 0, failed: 0, originalBytes: 0, encodedBytes: 0 },
  );

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("");
  console.log(`[optimize-media] ${dryRun ? "[dry-run] " : ""}Summary (${elapsed}s):`);
  console.log(`  Generated:  ${totals.generated}`);
  console.log(
    `  Skipped:    ${totals.skipped}${force ? "" : " (already existed; use --force to regenerate)"}`,
  );
  console.log(`  Failed:     ${totals.failed}`);
  if (!dryRun && totals.originalBytes > 0) {
    const saved = totals.originalBytes - totals.encodedBytes;
    console.log(
      `  Saved:      ${formatBytes(saved)} (${pct(saved, totals.originalBytes)} of source bytes)`,
    );
  }
  if (totals.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[optimize-media] Fatal:", err);
  process.exit(1);
});
