// Static audit against hardcoded Spanish strings in PUBLIC component
// chrome. Mirrors `admin-strings-audit.test.ts` but scoped to the
// public-facing surfaces a visitor in `?lang=en` actually reads.
//
// The bilingual rollout (ADR-0013) was supposed to route every chrome
// surface through the i18n dictionary, but residue accumulates:
// someone adding a new button forgets to swap the literal for
// `t("...")`. This audit catches the regression in CI before review.
//
// Heuristic — line-by-line scan of `components/**/*.tsx` for:
//
//   1. JSX text nodes inside `>text<` on a SINGLE line.
//   2. JSX text nodes that occupy their OWN line between a tag-open
//      ending on the previous line and a tag-close on the next line
//      (catches button labels split across lines for legibility).
//   3. `placeholder="..."` attribute values.
//   4. `aria-label="..."` and `title="..."` literal attribute values.
//      Unlike the admin audit (which deliberately skips these because
//      admin productivity surfaces sometimes embed `c.title.es`),
//      public chrome never embeds case content in static labels —
//      so a literal aria-label IS a residue worth flagging.
//
// Matches use Spanish-marker words OR letters with diacritics. The
// match is loose by design: false positives go on the WHITELIST below
// with a one-line comment.
//
// Out of scope:
//   - `components/admin/**` — covered by `admin-strings-audit.test.ts`.
//   - Test helpers, story files (not user-visible).
//   - Comment lines (file headers describe behaviour in Spanish).
//
// When you legitimately need a Spanish literal in a public surface,
// add the file to WHITELIST with a comment explaining why.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

/**
 * Files allowed to carry hardcoded Spanish text for now. Each entry
 * cites WHY the residue is acceptable. The WHITELIST shrinks to
 * empty as follow-up branches finish translating each surface.
 */
const WHITELIST = new Set<string>([
  // Admin-only chrome that happens to live under `components/cards/`
  // (it's mounted by `<CaseCard>` only when an admin is logged in,
  // not by any public-visitor codepath). The admin productivity
  // convention keeps these surfaces on the Spanish baseline — same
  // policy as `components/admin/**` covered by the sibling audit.
  // If the menu ever gains a non-admin codepath, remove this entry
  // and route every literal through the dictionary.
  "components/cards/AdminThumbMenu.tsx",
]);

/**
 * Folders we walk. Public-facing components only.
 */
const TARGETS = ["components/cards", "components/chrome", "components/cine", "components/modals"];

/** Specific files at the top level of `components/` that count as
 *  public chrome (not in a subfolder). */
const TARGET_FILES = [
  "components/App.tsx",
  "components/AppModals.tsx",
  "components/CatalogPagination.tsx",
  "components/CaseCardSkeleton.tsx",
  "components/EmptyState.tsx",
  "components/MainGrid.tsx",
  "components/SectionHero.tsx",
  "components/Sidebar.tsx",
  "components/Toolbar.tsx",
];

/**
 * Curated trigger words. Anything in this list is treated as a
 * Spanish marker even without diacritics. Same word list as the
 * admin audit; keep them aligned so a residue can't slip past one
 * scan by living in the other surface.
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
  "Cargando",
  "Cargar",
  "Buscar",
  "Limpiar",
  "Mostrar",
  "Mostrando",
  "Página",
  "Anterior",
  "Siguiente",
  "Inicio",
  // Public-only markers — words that surface in chrome a visitor reads
  // even when the accent set doesn't trigger the diacritic regex.
  "Atajos",
  "Cerrar",
  "Salir",
  "Galería",
  "Imagen",
  "Favorito",
  "Revisado",
  "luego",
  "navegar",
  "pausa",
  "salir",
];

/** Diacritic regex — anything with `á é í ó ú ñ`. */
const SPANISH_DIACRITIC = /[áéíóúñÁÉÍÓÚÑ]/;

/** JSX text inside `>text<` on a single line (no nested elements). */
const JSX_TEXT_PATTERN = />([^<>{}\n]+)</;

/**
 * JSX text that occupies its OWN line — e.g. a button label split
 * across three lines for legibility:
 *
 *   <button onClick={...}>
 *     ← Atrás
 *   </button>
 *
 * Matches a line that is pure visible text with no `<` / `>` / `{` /
 * `}` of its own. The caller verifies the surrounding lines look
 * like JSX tag boundaries before treating the match as a hit.
 */
const JSX_TEXT_ALONE = /^\s*([^<>{}\n][^<>{}\n]*?)\s*$/;

/** `placeholder="..."` literal value. */
const PLACEHOLDER_PATTERN = /placeholder="([^"]+)"/;

/**
 * `aria-label="..."` / `title="..."` literal values. Unlike the
 * admin audit (which skips these because admin productivity surfaces
 * sometimes embed `c.title.es` in labels), public chrome doesn't
 * embed case content in static labels, so a literal here IS a residue.
 */
const ARIA_LABEL_PATTERN = /aria-label="([^"]+)"/;
const TITLE_ATTR_PATTERN = /\btitle="([^"]+)"/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith(".tsx")) {
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
  kind: "jsx-text" | "jsx-text-alone" | "placeholder" | "aria-label" | "title";
  match: string;
}

function scan(): Hit[] {
  const hits: Hit[] = [];
  const seen = new Set<string>();

  // Folder walks
  for (const target of TARGETS) {
    const targetPath = join(ROOT, target);
    for (const file of walk(targetPath)) {
      const rel = relative(ROOT, file);
      if (WHITELIST.has(rel)) continue;
      seen.add(rel);
      scanFile(file, rel, hits);
    }
  }

  // Specific top-level files
  for (const rel of TARGET_FILES) {
    if (WHITELIST.has(rel)) continue;
    if (seen.has(rel)) continue;
    const full = join(ROOT, rel);
    try {
      statSync(full);
    } catch {
      continue; // file removed since this audit was written
    }
    scanFile(full, rel, hits);
  }
  return hits;
}

function scanFile(file: string, rel: string, hits: Hit[]) {
  const lines = readFileSync(file, "utf-8").split("\n");
  lines.forEach((line, idx) => {
    if (isCommentLine(line)) return;

    // 1. Single-line JSX text `>foo<`.
    const jsxMatch = line.match(JSX_TEXT_PATTERN);
    if (jsxMatch && jsxMatch[1]) {
      const text = jsxMatch[1].trim();
      if (text.length > 1 && looksSpanish(text)) {
        hits.push({ file: rel, line: idx + 1, kind: "jsx-text", match: text });
      }
    }

    // 2. Multi-line JSX text on its own line. We treat the line as
    //    a hit when (a) it isn't a comment, (b) it isn't a code
    //    statement (no `=`, no `;`, no `(`, no `import`/`return`),
    //    and (c) the previous non-blank line ends with `>` (tag-open)
    //    AND the next non-blank line starts with `<` (tag-close).
    //    This is conservative — single-line statements that happen
    //    to be pure text are rare in this codebase.
    const aloneMatch = line.match(JSX_TEXT_ALONE);
    if (aloneMatch && aloneMatch[1]) {
      const text = aloneMatch[1].trim();
      const looksLikeCode =
        text.includes("=") ||
        text.includes(";") ||
        text.includes("(") ||
        /^(import|export|const|let|var|return|if|else|for|while|function|class|interface|type)\b/.test(
          text,
        );
      if (text.length > 1 && !looksLikeCode && looksSpanish(text)) {
        const prev = previousNonBlank(lines, idx);
        const next = nextNonBlank(lines, idx);
        if (prev !== null && next !== null && prev.endsWith(">") && next.startsWith("<")) {
          hits.push({ file: rel, line: idx + 1, kind: "jsx-text-alone", match: text });
        }
      }
    }

    // 3-5. Attribute literals. Skip when the line already contains
    // a `t(` call — those literals are dictionary values reflected
    // here through the helper, not hardcoded copy.
    if (line.includes('t("') || line.includes("t(`")) return;
    const placeholderMatch = line.match(PLACEHOLDER_PATTERN);
    if (placeholderMatch && placeholderMatch[1]) {
      const text = placeholderMatch[1];
      if (text.length > 1 && looksSpanish(text)) {
        hits.push({ file: rel, line: idx + 1, kind: "placeholder", match: text });
      }
    }

    const ariaMatch = line.match(ARIA_LABEL_PATTERN);
    if (ariaMatch && ariaMatch[1]) {
      const text = ariaMatch[1];
      if (text.length > 1 && looksSpanish(text)) {
        hits.push({ file: rel, line: idx + 1, kind: "aria-label", match: text });
      }
    }

    const titleMatch = line.match(TITLE_ATTR_PATTERN);
    if (titleMatch && titleMatch[1]) {
      const text = titleMatch[1];
      if (text.length > 1 && looksSpanish(text)) {
        hits.push({ file: rel, line: idx + 1, kind: "title", match: text });
      }
    }
  });
}

function previousNonBlank(lines: string[], idx: number): string | null {
  for (let i = idx - 1; i >= 0; i -= 1) {
    const raw = lines[i];
    if (raw === undefined) continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (isCommentLine(raw)) continue;
    return trimmed;
  }
  return null;
}

function nextNonBlank(lines: string[], idx: number): string | null {
  for (let i = idx + 1; i < lines.length; i += 1) {
    const raw = lines[i];
    if (raw === undefined) continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (isCommentLine(raw)) continue;
    return trimmed;
  }
  return null;
}

describe("public chrome — hardcoded Spanish strings audit", () => {
  it("no JSX text or placeholder outside the whitelist contains Spanish copy", () => {
    const hits = scan();
    if (hits.length > 0) {
      const report = hits.map((h) => `  ${h.file}:${h.line}  [${h.kind}]  "${h.match}"`).join("\n");
      throw new Error(
        `Hardcoded Spanish strings detected in public chrome.\n\n` +
          `These are JSX text nodes or placeholder attributes that an\n` +
          `English-mode visitor (?lang=en) would read as Spanish. Use\n` +
          `\`useT()\` / \`useLanguage()\` and route through the i18n\n` +
          `dictionary, OR add the file to the WHITELIST in\n` +
          `tests/public-strings-audit.test.ts with a comment explaining\n` +
          `why the residue is acceptable + when it'll be cleaned up.\n\n` +
          `Hits:\n${report}\n`,
      );
    }
    expect(hits).toEqual([]);
  });
});
