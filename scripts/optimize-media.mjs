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
// Quality / encoder tuning:
//
//   - AVIF q=60, effort=4   — visually identical to the JPG source
//                              in side-by-side review for typical
//                              POCUS imagery (low-frequency content,
//                              no fine type/edges). Effort 4 is the
//                              sweet spot between encode time and
//                              compression. Higher effort (6-8) gets
//                              maybe 5% more savings but doubles the
//                              encode wall time.
//   - WebP q=75             — Safari < 16 / older Chromium fallback.
//                              Slightly higher quality target than
//                              AVIF because WebP's lossy ringing
//                              shows up sooner on medical imagery.
//
// Reads the original via `arrayBuffer`, decodes with sharp, encodes
// the variant, writes back to the same store under the sibling key.
// Original keys are NEVER deleted — the variant lives alongside as
// `<base>.avif` / `<base>.webp`.

import { getStore } from "@netlify/blobs";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const STORE = "imports";
const OPTIMIZABLE_EXTS = new Set([".jpg", ".jpeg", ".png"]);

const TARGETS = [
  {
    ext: ".avif",
    label: "AVIF",
    encode: (s) => s.avif({ quality: 60, effort: 4 }),
  },
  {
    ext: ".webp",
    label: "WebP",
    encode: (s) => s.webp({ quality: 75 }),
  },
];

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

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let totalOriginal = 0;
  let totalEncoded = 0;

  for (const { key } of blobs) {
    const ext = pathExt(key);
    if (!OPTIMIZABLE_EXTS.has(ext)) continue;

    const base = key.slice(0, -ext.length);

    // Lazy-load the original — only fetch it from the store if we
    // need to encode at least one variant. The store.get() is the
    // expensive operation here (round-trip + transfer over the
    // wire), so skipping it for already-converted keys is the
    // dominant performance win.
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
        const encoded = await target.encode(sharp(src, { failOn: "error" })).toBuffer();
        await store.set(targetKey, encoded);
        const ratio = pct(src.length - encoded.length, src.length);
        console.log(
          `✓ ${targetKey} — ${target.label}, ${formatBytes(encoded.length)} (${ratio} smaller than source)`,
        );
        generated++;
        totalOriginal += src.length;
        totalEncoded += encoded.length;
      } catch (err) {
        console.error(`✗ ${targetKey} — encode/upload failed:`, err.message ?? err);
        failed++;
      }
    }
  }

  console.log("");
  console.log(`[optimize-media] ${dryRun ? "[dry-run] " : ""}Summary:`);
  console.log(`  Generated:  ${generated}`);
  console.log(
    `  Skipped:    ${skipped}${force ? "" : " (already existed; use --force to regenerate)"}`,
  );
  console.log(`  Failed:     ${failed}`);
  if (!dryRun && totalOriginal > 0) {
    const saved = totalOriginal - totalEncoded;
    console.log(
      `  Saved:      ${formatBytes(saved)} (${pct(saved, totalOriginal)} of source bytes)`,
    );
  }
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[optimize-media] Fatal:", err);
  process.exit(1);
});
