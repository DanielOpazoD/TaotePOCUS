// Static audit of every TypeScript / TSX source file under
// `components/` and `hooks/` for raw access to bilingual case
// fields (`.title.es` / `.title.en` / `.description.es` /
// `.description.en` / `.tags.es` / `.tags.en`). Any access outside
// the curated whitelist below is a regression risk: the hotfix in
// commit `bc28792` showed that a stale legacy override merged on
// top of a normalized case can flip these fields back to plain
// strings / arrays at runtime, and `.es` accesses crash with
// "cannot read property of undefined".
//
// Policy:
//   - Public renderers (CaseCard, CaseModal, FeaturedRow,
//     PresentationMode) MUST go through `getCaseTitle` /
//     `getCaseDescription` / `getCaseTags` from `case-localized`.
//   - Admin productivity surfaces that work with the canonical
//     Spanish slot (BulkEditTable, ClassifierBoard, MinePanel,
//     CaseForm internals) are explicitly allowed — they're already
//     defensive against legacy shapes via `categoryLabelEs` /
//     `normalize…` upstream, and the access pattern is documented
//     in code comments.
//
// The test runs in CI as a guardrail against future regressions.
// When you legitimately need to add a raw access, add the file to
// the WHITELIST below with a one-line comment justifying it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** Project root resolved relative to this test file. */
const ROOT = join(__dirname, "..");

/**
 * Files allowed to access the bilingual slots directly. Each entry
 * is a path relative to project root; the path equality is exact
 * so we don't accidentally allow a whole folder when we meant one
 * file. Add a comment explaining WHY each entry is on the list.
 */
const WHITELIST = new Set<string>([
  // The helper module IS the seam — its whole job is to read these
  // fields with the right normalization + fallback.
  "lib/case-localized.ts",
  // Schema validators normalize to / from these slots.
  "lib/schemas.ts",
  // Storage migrations rewrite legacy payloads into this shape.
  "lib/storage-migrations.ts",
  // Description seam — the legacy single-string accessor that
  // explicitly reads `c.description.es` as the ES baseline.
  "lib/case-description.ts",
  // Dictionary files use translation KEYS like "form.label.tags.es"
  // — those are string literals naming the slot, not field accesses.
  "lib/i18n/dict.es.ts",
  "lib/i18n/dict.en.ts",

  // Admin productivity surfaces edit / sort by the ES slot directly.
  // These are documented at the callsite.
  "components/admin/MinePanel.tsx",
  "components/admin/AdminPanel.tsx",
  "components/admin/ClassifierBoard.tsx",
  "components/admin/CaseForm.tsx",
  "components/admin/case-form/MetadataPanel.tsx",
  "components/admin/bulk-edit/BulkEditRow.tsx",
  "components/admin/bulk-edit/BulkEditTable.tsx",
  "components/admin/bulk-edit/cells/Thumb.tsx",
  "components/cards/AdminThumbMenu.tsx",
  "components/admin/classifier/useClassifierDrag.tsx",
  "components/admin/classifier/ClassifierDragHint.tsx",

  // App.tsx aggregates the admin tag-vocabulary from `c.tags.es`
  // for the form autocomplete (Spanish source list). The aria
  // surface stays read-from-ES too — admin productivity, not
  // public display.
  "components/App.tsx",
]);

/**
 * Folders we walk. Stays narrow on purpose — the audit is about
 * the React component tree, not test fixtures or build output.
 */
const TARGETS = ["components", "hooks", "lib"];

/**
 * Patterns flagged. Kept regex-based because tsc has no
 * "forbidden-property-access" rule out of the box and writing one
 * via the TS compiler API for one hot-spot is overkill.
 *
 * The patterns intentionally don't match `.tags.es` inside string
 * literals or comments — they require a `.` immediately before the
 * field name, which JSDoc / human prose can match by accident. We
 * post-filter line-by-line to drop comment lines.
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: ".title.es", regex: /\.title\.es\b/ },
  { name: ".title.en", regex: /\.title\.en\b/ },
  { name: ".description.es", regex: /\.description\.es\b/ },
  { name: ".description.en", regex: /\.description\.en\b/ },
  { name: ".tags.es", regex: /\.tags\.es\b/ },
  { name: ".tags.en", regex: /\.tags\.en\b/ },
];

/** Recursive walk that yields every `.ts` / `.tsx` file under
 *  `dir`, skipping `node_modules`, `.next`, snapshots and tests. */
function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry.endsWith("-snapshots") ||
      entry === "__tests__"
    )
      continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      // Skip test files — they sometimes use the modern shape
      // explicitly to assert against it, which is fine.
      if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;
      yield full;
    }
  }
}

/** True for lines that are entirely a single-line comment, a
 *  block-comment continuation, or a JSDoc line. We strip these
 *  before regex-matching so prose mentioning the slot names doesn't
 *  trip the audit. */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*/")
  );
}

interface Hit {
  file: string;
  line: number;
  pattern: string;
  text: string;
}

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const target of TARGETS) {
    const targetPath = join(ROOT, target);
    for (const file of walk(targetPath)) {
      const rel = relative(ROOT, file);
      if (WHITELIST.has(rel)) continue;
      const lines = readFileSync(file, "utf-8").split("\n");
      lines.forEach((line, idx) => {
        if (isCommentLine(line)) return;
        for (const { name, regex } of FORBIDDEN_PATTERNS) {
          if (regex.test(line)) {
            hits.push({ file: rel, line: idx + 1, pattern: name, text: line.trim() });
          }
        }
      });
    }
  }
  return hits;
}

describe("localized consumer audit", () => {
  it("no source file outside the whitelist accesses bilingual slots directly", () => {
    const hits = scan();
    if (hits.length > 0) {
      const report = hits
        .map((h) => `  ${h.file}:${h.line}  [${h.pattern}]\n    ${h.text}`)
        .join("\n");
      throw new Error(
        `Direct access to bilingual case fields detected outside the whitelist.\n\n` +
          `These callsites can crash at runtime when a legacy-shaped patch is\n` +
          `merged on top of a normalized case (production hotfix bc28792).\n` +
          `Use the helpers in lib/case-localized — getCaseTitle /\n` +
          `getCaseDescription / getCaseTags — instead, OR add the file to the\n` +
          `WHITELIST in tests/localized-consumer-audit.test.ts with a comment\n` +
          `explaining why the raw access is safe.\n\n` +
          `Hits:\n${report}\n`,
      );
    }
    // The expect call here is purely so the test framework reports
    // a passing assertion. Real failure is the `throw` above.
    expect(hits).toEqual([]);
  });
});
