// Defensive shape validators for the data the app reads from
// untrusted sources: the corpus JSON (from `public/data/`), the
// override map (from localStorage), the user-cases list (from
// localStorage or DB), and the favorites list. Each validator
// returns the SAFE subset and reports what was dropped.
//
// Why hand-rolled instead of zod / valibot:
//   - Zero new runtime deps (~80 KB minified for zod, plus its
//     types in the bundle).
//   - The shapes are small and stable; the full power of a schema
//     library is overkill.
//   - Compile-time we still have TypeScript, so the validators
//     are a runtime-only safety net for input we can't trust at
//     compile time (JSON.parse output, localStorage.getItem
//     output, network responses).
//
// Scope note (May-2026): the no-zod policy applies HERE — to the
// corpus validators that ship in every client bundle. API contracts
// under `lib/schemas/api/**` DO use zod because:
//   (a) those shapes change more often (every route eventually gets
//       a new field) — the maintenance cost of hand-rolled cascades
//       there outweighs the dep cost,
//   (b) the zod runtime stays in server bundles + the admin chunk
//       (lazy-loaded), so the public catalog bundle is unaffected,
//   (c) cross-route shapes share zod sub-schemas (LocalizedCaseContent,
//       AICallMeta, etc.) — duplicating those across N hand-rolled
//       routes was a different kind of slow-grind drift.
// See `lib/schemas/api/README.md` for the full split rationale.
//
// Policy:
//   - Required fields missing → entry rejected. The merge layer
//     won't see it; the catalog stays consistent.
//   - Wrong-type required fields → entry rejected.
//   - Unknown fields preserved (forward-compat: future fields
//     added by a re-import shouldn't be stripped here).
//   - Optional fields with wrong types → field stripped, rest of
//     the entry kept. Better to lose a malformed `focus` than
//     to drop the whole case.
//
// Bilingual fields (`title`, `description`, `tags`) accept BOTH
// the legacy plain-string shape and the modern `LocalizedString` /
// `LocalizedTags` objects. Inputs are normalized in the validator
// so consumers downstream of the data boundary always see the
// modern shape — no per-callsite migration needed.
//
// Errors are reported via the returned `dropped` count (and a
// brief `log.warn` once per validation pass — we don't spam the
// console with 326 individual lines if the entire corpus is
// malformed).

import { normalizeLocalizedString, normalizeLocalizedTags } from "./case-localized";
import { log } from "./log";
import type { CaseRecord, LocalizedString, LocalizedTags, MediaKind, SectionId } from "./types";

const SECTIONS: ReadonlySet<SectionId> = new Set<SectionId>([
  "atlas",
  "ecg",
  "cases",
  "info",
  "rayos",
]);

const MEDIA_KINDS: ReadonlySet<MediaKind> = new Set<MediaKind>(["video", "image", "gif"]);

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A bilingual title/description is "valid" if it's either a
 * non-empty string (legacy shape — we'll normalize on output) or
 * an object with a non-empty `es` slot. Empty / missing values
 * still fail the required-field check.
 */
function isValidLocalizedStringInput(v: unknown): boolean {
  if (typeof v === "string") return v.length > 0;
  if (isPlainObject(v)) return typeof v.es === "string" && v.es.length > 0;
  return false;
}

/**
 * A bilingual tag list accepts the legacy `string[]` shape or the
 * modern `{ es: string[]; en?: string[] }` object. An empty ES list
 * is allowed (matches the legacy `tags: []` cases the corpus has).
 */
function isValidLocalizedTagsInput(v: unknown): boolean {
  if (isStringArray(v)) return true;
  if (isPlainObject(v)) return Array.isArray(v.es);
  return false;
}

/**
 * Validate one case. Returns the case (typed) or `null` if it
 * fails the required-field check. Optional malformed fields are
 * dropped without rejecting the whole entry.
 */
export function validateCase(raw: unknown): CaseRecord | null {
  if (!isPlainObject(raw)) return null;
  const r = raw;

  // ─── Required ──────────────────────────────────────────────
  if (!isNonEmptyString(r.id)) return null;
  if (!isValidLocalizedStringInput(r.title)) return null;
  if (!isString(r.section) || !SECTIONS.has(r.section as SectionId)) return null;
  if (!isNonEmptyString(r.category)) return null;
  if (!isValidLocalizedTagsInput(r.tags)) return null;
  if (!isString(r.modality)) return null;
  if (!isNonEmptyString(r.loop)) return null;
  if (!isString(r.author)) return null;
  if (!isString(r.role)) return null;
  if (!isString(r.date)) return null;
  // Description is required but accepts an empty body — some legacy
  // imports landed without one. Validate the SHAPE; the helper
  // tolerates an empty `es` slot below.
  if (
    !(
      typeof r.description === "string" ||
      (isPlainObject(r.description) && typeof r.description.es === "string")
    )
  ) {
    return null;
  }

  // ─── Optional, sanitize when present ───────────────────────
  const out: Record<string, unknown> = { ...r };

  // Normalize bilingual fields to the modern shape so consumers
  // never see the legacy plain-string / plain-array form. Idempotent
  // — already-normalized inputs pass through unchanged.
  out.title = normalizeLocalizedString(r.title);
  out.description = normalizeLocalizedString(r.description);
  out.tags = normalizeLocalizedTags(r.tags);

  // featured: must be boolean if present.
  if ("featured" in r && typeof r.featured !== "boolean") delete out.featured;

  // media: must be a valid Media object if present.
  if ("media" in r) {
    const m = r.media;
    if (
      !isPlainObject(m) ||
      !isString(m.kind) ||
      !MEDIA_KINDS.has(m.kind as MediaKind) ||
      !isString(m.src)
    ) {
      delete out.media;
    }
  }

  // mediaExtra: must be an array of valid Media. Filter bad entries.
  if ("mediaExtra" in r) {
    if (!Array.isArray(r.mediaExtra)) {
      delete out.mediaExtra;
    } else {
      out.mediaExtra = r.mediaExtra.filter(
        (m) =>
          isPlainObject(m) &&
          isString(m.kind) &&
          MEDIA_KINDS.has(m.kind as MediaKind) &&
          isString(m.src),
      );
    }
  }

  // difficulty
  if ("difficulty" in r) {
    const d = r.difficulty;
    if (d !== "basic" && d !== "intermediate" && d !== "advanced") delete out.difficulty;
  }

  // String-typed optionals.
  for (const k of ["lastUpdated", "deletedAt", "deletedBy"] as const) {
    if (k in r && typeof r[k] !== "string") delete out[k];
  }

  // boolean-typed optionals.
  for (const k of ["reviewed", "purged"] as const) {
    if (k in r && typeof r[k] !== "boolean") delete out[k];
  }

  // focus: each sub-field must be a number if present; entire focus
  // dropped if not an object.
  if ("focus" in r) {
    const f = r.focus;
    if (!isPlainObject(f)) {
      delete out.focus;
    } else {
      const cleanFocus: Record<string, number> = {};
      for (const k of ["x", "y", "scale"] as const) {
        if (typeof f[k] === "number" && Number.isFinite(f[k])) cleanFocus[k] = f[k];
      }
      out.focus = cleanFocus;
    }
  }

  // The required fields above were checked before this point so
  // `out` carries the right shape for them. The `unknown` cast is
  // the documented escape hatch from the structural-check world
  // back into the typed world.
  return out as unknown as CaseRecord;
}

/**
 * Validate an array of cases (the corpus JSON shape). Drops bad
 * entries silently and reports the count. Returns `[]` for
 * non-array input.
 */
export function validateCorpus(
  raw: unknown,
  area: string,
): { cases: CaseRecord[]; dropped: number } {
  if (!Array.isArray(raw)) {
    log.warn(`Corpus is not an array — got ${typeof raw}`, { area });
    return { cases: [], dropped: 0 };
  }
  const cases: CaseRecord[] = [];
  let dropped = 0;
  for (const item of raw) {
    const valid = validateCase(item);
    if (valid) cases.push(valid);
    else dropped += 1;
  }
  if (dropped > 0) {
    log.warn(`Dropped ${dropped} malformed cases from corpus`, { area });
  }
  return { cases, dropped };
}

/**
 * Validate the override map (`Record<id, Partial<CaseRecord>>`).
 * Override entries are PARTIAL — every field is optional — so the
 * validation is permissive: any non-object key is dropped, any
 * non-string-keyed entry is dropped, and within each entry only
 * fields with the wrong type are stripped (the entry itself
 * survives).
 *
 * Returns the safe subset + the number of dropped entries.
 */
export function validateOverrideMap(
  raw: unknown,
  area: string,
): { overrides: Record<string, Partial<CaseRecord>>; dropped: number } {
  if (!isPlainObject(raw)) {
    log.warn(`Override map is not an object — got ${typeof raw}`, { area });
    return { overrides: {}, dropped: 0 };
  }
  const overrides: Record<string, Partial<CaseRecord>> = {};
  let dropped = 0;
  for (const [id, patch] of Object.entries(raw)) {
    if (!isPlainObject(patch)) {
      dropped += 1;
      continue;
    }
    // Override entries are always partial — we strip wrong-typed
    // fields but keep the rest of the patch. The merge layer then
    // applies the cleaned patch on top of the source case.
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      // Cheap structural checks for the most common fields. This
      // is conservative: unknown / unfamiliar field names pass
      // through (forward-compat) — only KNOWN fields with the
      // wrong type are stripped.
      if (k === "tags") {
        if (!isValidLocalizedTagsInput(v)) continue;
        // Normalize so consumers see the modern shape regardless
        // of which form the override was persisted in.
        clean[k] = normalizeLocalizedTags(v) satisfies LocalizedTags;
        continue;
      }
      if (k === "title" || k === "description") {
        if (!isValidLocalizedStringInput(v)) continue;
        clean[k] = normalizeLocalizedString(v) satisfies LocalizedString;
        continue;
      }
      if (k === "section" && (!isString(v) || !SECTIONS.has(v as SectionId))) continue;
      if (
        (k === "category" ||
          k === "modality" ||
          k === "loop" ||
          k === "author" ||
          k === "role" ||
          k === "date" ||
          k === "lastUpdated" ||
          k === "deletedAt" ||
          k === "deletedBy") &&
        typeof v !== "string"
      ) {
        continue;
      }
      if ((k === "featured" || k === "reviewed" || k === "purged") && typeof v !== "boolean") {
        continue;
      }
      clean[k] = v;
    }
    overrides[id] = clean as Partial<CaseRecord>;
  }
  if (dropped > 0) {
    log.warn(`Dropped ${dropped} malformed override entries`, { area });
  }
  return { overrides, dropped };
}

/**
 * Validate the favorites list (just an array of case ids). Drops
 * non-string entries; returns `[]` for non-array input.
 */
export function validateFavsList(raw: unknown, area: string): string[] {
  if (!Array.isArray(raw)) {
    log.warn(`Favs list is not an array — got ${typeof raw}`, { area });
    return [];
  }
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === "string" && x.length > 0) out.push(x);
  }
  return out;
}
