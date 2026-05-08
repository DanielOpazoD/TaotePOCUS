#!/usr/bin/env node
//
// Migration retired (Bloque O, May-2026).
//
// Original purpose: collapse `findings` / `summary` / `diagnosis` on
// every case in `lib/imported-cases.ts` into a single canonical
// `description` field — step 4 of ADR-0008's removal plan. The
// migration was applied successfully and the corpus has been
// fully on the canonical-description shape for months. After
// Bloque O the corpus also moved out of TypeScript and into
// `public/data/imported-cases.json`, so this script's text-based
// rewrite of the .ts file is doubly obsolete.
//
// Kept as a no-op rather than deleted so that any pre-existing
// tooling, CI scripts, or runbook entries that invoke
// `node scripts/migrate-description.mjs` don't crash silently.
// Exits 0 with an informational message.

console.log("[migrate-description] noop — migration already applied,");
console.log("[migrate-description] corpus has moved to JSON (Bloque O).");
console.log("[migrate-description] See docs/adr/0008 + public/data/imported-cases.json.");
