// Static audit against hardcoded Spanish strings in admin chrome.
//
// The bilingual rollout (ADR-0013) wired every chrome surface
// through the i18n dictionary, but residue accumulates: someone
// adding a new button forgets to swap the literal for `t("...")`,
// the visitor in `?lang=en` sees "Cancelar" sitting next to
// "Save". This audit catches the regression in CI before review.
//
// Heuristic — line-by-line scan of `components/admin/**/*.tsx`
// for JSX text nodes and `placeholder` attributes that contain
// Spanish-marker words OR letters with diacritics. Comment lines
// are skipped (the file headers describe behaviour in Spanish).
// The match is loose by design: if it flags a false positive,
// the file goes on the WHITELIST below with a comment explaining
// why the literal is allowed.
//
// Why JSX text + placeholder ONLY (not aria-label / title):
//   - aria-label and title sometimes embed the case's `c.title.es`
//     (admin productivity convention — the editor works against
//     the canonical Spanish baseline). Flagging those would
//     produce noise.
//   - JSX text + placeholder are the ones a visitor in `?lang=en`
//     actually reads in plain sight, so they're the highest-
//     priority targets for translation.
//
// When you legitimately need a Spanish literal in scope, add the
// file to WHITELIST with a one-line comment that links to the
// follow-up branch / ADR.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

/**
 * Files allowed to carry hardcoded Spanish text for now. Each entry
 * cites WHY the residue is acceptable. The WHITELIST shrinks to
 * empty as follow-up branches finish translating each surface; if
 * a translation already shipped, the entry should be REMOVED, not
 * left as a no-op.
 *
 * Today's debt — scheduled for a follow-up branch
 * (`codex/admin-i18n-residuals`):
 */
const WHITELIST = new Set<string>([
  // Activity log labels (event-type → human label map). Live in
  // an internal admin-only timeline; localising the label map is
  // a follow-up that also needs to handle past activity rows
  // (which were written under a different label).
  "components/admin/ActivityPanel.tsx",
  // Backup panel — `<button>Cancelar</button>` in two confirm
  // flows + a couple of inline status strings. Pending follow-up.
  "components/admin/BackupPanel.tsx",
  // Categories editor — the Phase-3 dual-input rename surface
  // shipped, but the page heading + add-row placeholder + a
  // couple of action buttons stayed Spanish. Follow-up.
  "components/admin/CategoriesEditor.tsx",
  // CaseForm orchestrator — owns the modal head copy + the
  // bottom action row ("Cancelar" / "Guardar cambios" /
  // "Publicar caso"). Routed through `form.action.*` keys
  // already; the orchestrator just needs the swap.
  "components/admin/CaseForm.tsx",
  // Sections editor — "Restaurar" reset button + cancel button
  // in the bilingual rename row. Follow-up.
  "components/admin/SectionsEditor.tsx",
  // Bulk action bar — "Quitar revisado" button label + title
  // attribute. Follow-up.
  "components/admin/classifier/BulkActionBar.tsx",
  // Classifier — empty-state message ("Cuando este filtro tenga
  // casos pendientes, aparecerán acá.") and a couple of inline
  // titles. Follow-up.
  "components/admin/ClassifierBoard.tsx",
]);

/**
 * Folders we walk. Keep narrow on purpose — the audit is about
 * admin chrome regressions, not the entire app.
 */
const TARGETS = ["components/admin"];

/**
 * Curated trigger words. Anything in this list is treated as a
 * Spanish marker even without diacritics (because words like
 * "Cancelar" / "Buscar" don't carry tildes). Keep small + obvious;
 * a wider list inflates false positives.
 */
const SPANISH_MARKER_WORDS: ReadonlyArray<string> = [
  "Categoría",
  "Categorías",
  "Etiqueta",
  "Etiquetas",
  "Autor",
  "Especialidad",
  "Modalidad",
  "Sección",
  "Secciones",
  "Bienvenido",
  "Quitar",
  "Restaurar",
  "Cancelar",
  "Confirmar",
  "Eliminar",
  "Procesando",
  "Imágenes",
  "Añadir",
];

/** Diacritic regex — anything with `á é í ó ú ñ`. */
const SPANISH_DIACRITIC = /[áéíóúñÁÉÍÓÚÑ]/;

/**
 * JSX text inside `>text<` (no nested elements). Captures the
 * inner text run so we can check it separately from the
 * surrounding tag soup.
 */
const JSX_TEXT_PATTERN = />([^<>{}\n]+)</;

/** `placeholder="..."` literal value. */
const PLACEHOLDER_PATTERN = /placeholder="([^"]+)"/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith(".tsx")) {
      // Skip co-located tests if any ever land in components/admin.
      if (entry.endsWith(".test.tsx")) continue;
      yield full;
    }
  }
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*/")
  );
}

function looksSpanish(s: string): boolean {
  if (SPANISH_DIACRITIC.test(s)) return true;
  for (const word of SPANISH_MARKER_WORDS) {
    if (s.includes(word)) return true;
  }
  return false;
}

interface Hit {
  file: string;
  line: number;
  kind: "jsx-text" | "placeholder";
  match: string;
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

        // JSX text node match.
        const jsxMatch = line.match(JSX_TEXT_PATTERN);
        if (jsxMatch && jsxMatch[1]) {
          const text = jsxMatch[1].trim();
          if (text.length > 1 && looksSpanish(text)) {
            hits.push({ file: rel, line: idx + 1, kind: "jsx-text", match: text });
          }
        }

        // Placeholder literal match. Skip when the line already
        // contains `t("` — the placeholder is being rendered through
        // a `t()` call adjacently, so the literal is the dictionary
        // value visible in this file by accident, not a hardcoded
        // copy.
        if (line.includes('t("') || line.includes("t(`")) return;
        const placeholderMatch = line.match(PLACEHOLDER_PATTERN);
        if (placeholderMatch && placeholderMatch[1]) {
          const text = placeholderMatch[1];
          if (text.length > 1 && looksSpanish(text)) {
            hits.push({ file: rel, line: idx + 1, kind: "placeholder", match: text });
          }
        }
      });
    }
  }
  return hits;
}

describe("admin chrome — hardcoded Spanish strings audit", () => {
  it("no JSX text or placeholder outside the whitelist contains Spanish copy", () => {
    const hits = scan();
    if (hits.length > 0) {
      const report = hits.map((h) => `  ${h.file}:${h.line}  [${h.kind}]  "${h.match}"`).join("\n");
      throw new Error(
        `Hardcoded Spanish strings detected in admin chrome.\n\n` +
          `These are JSX text nodes or placeholder attributes that an\n` +
          `English-mode visitor would read as Spanish. Use \`useT()\` /\n` +
          `\`useLanguage()\` and route through the i18n dictionary, OR\n` +
          `add the file to the WHITELIST in\n` +
          `tests/admin-strings-audit.test.ts with a comment explaining\n` +
          `why the residue is acceptable + when it'll be cleaned up.\n\n` +
          `Hits:\n${report}\n`,
      );
    }
    expect(hits).toEqual([]);
  });
});
