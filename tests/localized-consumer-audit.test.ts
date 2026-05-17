// Static audit of every TypeScript / TSX source file under
// `components/` and `hooks/` for raw access to bilingual case
// fields. Two failure modes covered:
//
//   1. Direct slot access — `.title.es`, `.title.en`, `.description.es`,
//      `.description.en`, `.tags.es`, `.tags.en`. The hotfix in commit
//      `bc28792` showed that a stale legacy override merged on top
//      of a normalized case can flip these fields back to plain
//      strings / arrays at runtime, and `.es` accesses crash with
//      "cannot read property of undefined".
//
//   2. Stringification of the LocalizedString object — using
//      `c.title` / `c.description` directly inside a template literal
//      or a string concatenation. `LocalizedString` is `{ es, en? }`,
//      so `${c.title}` silently produces `"[object Object]"`. The
//      ConfirmDialog regression that shipped to production for weeks
//      had this exact shape: `\`¿Eliminar "${pendingDelete.title}"?\``.
//      TypeScript can't catch it (template literals accept anything
//      via `.toString()`); JSX can't catch it (React errors at runtime
//      when an object is a child, but template literals don't render
//      directly). This static check IS the catch.
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

  // AI suggestions panel reads from a specific slot (es OR en) to
  // produce the OTHER slot. By design — the whole purpose is to
  // translate FROM one language TO the other, so the
  // `getCaseTitle(c, lang)` helper (which abstracts away which
  // slot is being read) doesn't fit. The translation request
  // shape carries plain strings, not LocalizedString, so the
  // downstream provider never sees the bilingual object —
  // there's no `[object Object]` risk here.
  "components/admin/ai/AISuggestionsPanel.tsx",

  // AI editorial-rewrite modals send the ES slot to the AI and
  // write both ES + EN slots back. Same design constraint as the
  // translate panel above: the operation IS language-specific,
  // so the lang-agnostic helper doesn't fit. The plain-string
  // payload to /api/admin/ai/rewrite has no LocalizedString
  // shape — no `[object Object]` risk.
  "components/admin/ai/AIRewriteModal.tsx",
  "components/admin/ai/AIBulkRewriteModal.tsx",
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
 *
 * The `.title` / `.description` stringification patterns specifically
 * require the access to be terminal — followed by `}` (template
 * interpolation close) or whitespace/punctuation that ends an
 * expression, with negative lookahead against `.es` / `.en` / `.value`
 * / `(` (call) / `=`, `.fallback` so legitimate continuations don't
 * trip the audit:
 *   - `${getCaseTitle(c, lang).value}` — `.value` follows, OK
 *   - `setCase({ title: newTitle })` — `:` follows, OK (property key)
 *   - `${c.title}`                    — `}` follows, FLAGGED
 *   - ``Hello ${c.description}!``     — `}` follows, FLAGGED
 *   - `"prefix" + c.title`            — end-of-expr context, hard to
 *     match safely with regex; caught separately below.
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<{
  name: string;
  regex: RegExp;
  hint?: string;
}> = [
  { name: ".title.es", regex: /\.title\.es\b/ },
  { name: ".title.en", regex: /\.title\.en\b/ },
  { name: ".description.es", regex: /\.description\.es\b/ },
  { name: ".description.en", regex: /\.description\.en\b/ },
  { name: ".tags.es", regex: /\.tags\.es\b/ },
  { name: ".tags.en", regex: /\.tags\.en\b/ },
  // Stringification: `${x.title}` or `${x.description}` inside a
  // template literal. The `\$\{[^}]*` prefix anchors us to the
  // interpolation context. We require `\.(title|description)\}` —
  // the access terminates with the interpolation-close brace.
  // Anything followed by another property access (`.value`, `.es`,
  // `(` for a method call) doesn't match.
  {
    name: "${...title} (LocalizedString stringified)",
    regex: /\$\{[^}]*\.title\}/,
    hint: "Use `${getCaseTitle(c, lang).value}` instead.",
  },
  {
    name: "${...description} (LocalizedString stringified)",
    regex: /\$\{[^}]*\.description\}/,
    hint: "Use `${getCaseDescription(c, lang).value}` instead.",
  },
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
  hint?: string;
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
        for (const { name, regex, hint } of FORBIDDEN_PATTERNS) {
          if (regex.test(line)) {
            hits.push({ file: rel, line: idx + 1, pattern: name, text: line.trim(), hint });
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
        .map(
          (h) =>
            `  ${h.file}:${h.line}  [${h.pattern}]\n    ${h.text}` +
            (h.hint ? `\n    → ${h.hint}` : ""),
        )
        .join("\n");
      throw new Error(
        `Direct access to bilingual case fields detected outside the whitelist.\n\n` +
          `These callsites can crash at runtime when a legacy-shaped patch is\n` +
          `merged on top of a normalized case (production hotfix bc28792), OR\n` +
          `silently render "[object Object]" when a LocalizedString is\n` +
          `stringified via template-literal interpolation (the ConfirmDialog\n` +
          `regression that shipped to prod and was caught by user screenshot).\n\n` +
          `Use the helpers in lib/case-localized — getCaseTitle /\n` +
          `getCaseDescription / getCaseTags — and read \`.value\` from the\n` +
          `returned \`LocalizedRead\`, OR add the file to the WHITELIST in\n` +
          `tests/localized-consumer-audit.test.ts with a comment explaining\n` +
          `why the raw access is safe.\n\n` +
          `Hits:\n${report}\n`,
      );
    }
    // The expect call here is purely so the test framework reports
    // a passing assertion. Real failure is the `throw` above.
    expect(hits).toEqual([]);
  });
});
