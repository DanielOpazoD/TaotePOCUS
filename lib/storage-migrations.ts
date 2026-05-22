// Versioned localStorage migrations.
//
// Why this module exists: the Phase-2 i18n rollout widened
// `CaseRecord.title` / `description` / `tags` from plain strings /
// arrays to `LocalizedString` / `LocalizedTags`, and Phase-3 did the
// same for `Category.label` and section label overrides. The data
// boundary validators (`lib/schemas.ts`, the deserialize hooks)
// normalize on read, but a stale entry that already lived in React
// state from a previous session bypasses the validator on the next
// merge step (`mergeWithOverrides` spreads the legacy patch on top
// of a normalized case and the result drifts back to the legacy
// shape). The hotfix in commit `bc28792` defended the read helpers,
// but a one-time explicit upgrade closes the gap at the source.
//
// Strategy: track a monotonic schema version in `pocus_schema_version`
// and run the migration ladder once per app start whenever the
// stored version is below the latest. Each migration:
//   - reads the affected localStorage key(s),
//   - rewrites the payload in the modern shape,
//   - is idempotent (running it twice is a no-op),
//   - swallows malformed JSON (the validator in `lib/schemas.ts`
//     would have dropped it anyway).
//
// Failures are logged but never throw — a corrupt entry in one
// migration shouldn't block the rest of the upgrade. After all
// migrations succeed (or are skipped), we write the new version
// back so the next mount short-circuits the whole thing.

import { normalizeLocalizedString, normalizeLocalizedTags } from "./case-localized";
import { log } from "./log";
import { STORAGE_KEYS } from "./storage-keys";
import type { Category, CaseRecord, LocalizedString, SectionId } from "./types";

/** Latest schema version. Bump when adding a new migration below. */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Read the persisted schema version. Missing / malformed values are
 * treated as version 0 (pre-Phase-2, the universe of legacy shapes).
 */
function readPersistedVersion(): number {
  if (typeof window === "undefined") return CURRENT_SCHEMA_VERSION;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.schemaVersion);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Persist the version stamp. Best-effort — a failure here only
 *  means we re-run the (idempotent) migrations on the next start. */
function writePersistedVersion(version: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.schemaVersion, String(version));
  } catch {
    /* ignore — disk full / private mode */
  }
}

/** Read + parse a JSON-encoded localStorage entry. Returns `null`
 *  for missing / malformed values (caller skips the migration).
 *  A parse failure is worth a warning — it usually indicates user
 *  data corruption (manual edit, partial write during a browser
 *  crash). Sentry surfaces these so we can see if a particular
 *  key keeps tripping. */
function readJson<T = unknown>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    log.warn("storage-migration-parse-failure", { area: "storage-migrations", key }, err);
    return null;
  }
}

/** Best-effort JSON write. Tolerates serialization or quota errors. */
function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    log.warn("storage-migration: write failed", { area: "migrations", key }, err);
  }
}

/**
 * Migration 1 — Phase-2/3 shape upgrade.
 *
 * Touches every key whose payload includes the bilingual fields:
 *   - `pocus_user_cases` — array of `CaseRecord` with `title` /
 *     `description` / `tags` widened.
 *   - `pocus_case_overrides` — map<id, Partial<CaseRecord>> with
 *     the same fields when present.
 *   - `customCategories` — array of `Category` with `label` widened
 *     to `LocalizedString`.
 *   - `sectionLabelOverrides` — map<sectionId, string |
 *     LocalizedString>.
 *
 * Idempotent: a payload already in the modern shape passes through
 * unchanged because the normalizers are idempotent.
 */
function migrateToV1(): void {
  // 1. User cases — full CaseRecord array.
  const userCases = readJson<unknown>(STORAGE_KEYS.userCases);
  if (Array.isArray(userCases)) {
    const upgraded = userCases.map((c) => upgradeCaseShape(c));
    writeJson(STORAGE_KEYS.userCases, upgraded);
  }

  // 2. Override map — partial CaseRecord per id. Only the bilingual
  //    fields need touching; everything else is forward-compat.
  const overrides = readJson<Record<string, unknown>>(STORAGE_KEYS.caseOverrides);
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    const upgraded: Record<string, Partial<CaseRecord>> = {};
    for (const [id, patch] of Object.entries(overrides)) {
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) continue;
      upgraded[id] = upgradePatchShape(patch as Record<string, unknown>);
    }
    writeJson(STORAGE_KEYS.caseOverrides, upgraded);
  }

  // 3. Custom categories — array of `{ id; label }`.
  const customCats = readJson<unknown>(STORAGE_KEYS.customCategories);
  if (Array.isArray(customCats)) {
    const upgraded: Category[] = [];
    for (const c of customCats) {
      if (!c || typeof c !== "object") continue;
      const obj = c as Record<string, unknown>;
      if (typeof obj.id !== "string" || obj.id.length === 0) continue;
      const label = upgradeLabelShape(obj.label);
      if (!label.es) continue; // drop labels with no usable ES baseline.
      upgraded.push({ id: obj.id, label });
    }
    writeJson(STORAGE_KEYS.customCategories, upgraded);
  }

  // 4. Section label overrides — map<sectionId, string |
  //    LocalizedString>. Drop empty / malformed entries.
  const sectionOverrides = readJson<Record<string, unknown>>(STORAGE_KEYS.sectionLabelOverrides);
  if (
    sectionOverrides &&
    typeof sectionOverrides === "object" &&
    !Array.isArray(sectionOverrides)
  ) {
    const upgraded: Partial<Record<SectionId, LocalizedString>> = {};
    for (const [k, v] of Object.entries(sectionOverrides)) {
      const label = upgradeLabelShape(v);
      if (!label.es && !label.en) continue;
      upgraded[k as SectionId] = label;
    }
    writeJson(STORAGE_KEYS.sectionLabelOverrides, upgraded);
  }
}

/**
 * Coerce a `CaseRecord`-shaped object to the modern bilingual shape.
 * Idempotent. Used by the user-cases migration above and the
 * imported-corpus normalize step elsewhere.
 */
function upgradeCaseShape(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  // Only touch the bilingual fields — everything else passes
  // through verbatim (forward-compat with future field additions).
  return {
    ...obj,
    ...(obj.title !== undefined ? { title: normalizeLocalizedString(obj.title) } : {}),
    ...(obj.description !== undefined
      ? { description: normalizeLocalizedString(obj.description) }
      : {}),
    ...(obj.tags !== undefined ? { tags: normalizeLocalizedTags(obj.tags) } : {}),
  };
}

/** Same idea but for an override patch (partial). Mutates only the
 *  bilingual slots when present. */
function upgradePatchShape(patch: Record<string, unknown>): Partial<CaseRecord> {
  const out: Record<string, unknown> = { ...patch };
  if ("title" in patch) out.title = normalizeLocalizedString(patch.title);
  if ("description" in patch) out.description = normalizeLocalizedString(patch.description);
  if ("tags" in patch) out.tags = normalizeLocalizedTags(patch.tags);
  return out as Partial<CaseRecord>;
}

/** Normalize a `LocalizedString`-or-legacy-string label. Used by
 *  the categories + section-overrides migrations above. */
function upgradeLabelShape(value: unknown): LocalizedString {
  if (typeof value === "string") return { es: value };
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: LocalizedString = {
      es: typeof obj.es === "string" ? obj.es : "",
    };
    if (typeof obj.en === "string" && obj.en.length > 0) out.en = obj.en;
    return out;
  }
  return { es: "" };
}

/** Migration table. Index = target version. Each fn upgrades from
 *  `version - 1` to `version` and is idempotent. */
const MIGRATIONS: Record<number, () => void> = {
  1: migrateToV1,
};

/**
 * Run every pending migration. Idempotent: when the persisted
 * version already matches the latest, returns immediately. Errors
 * inside a migration are logged but don't stop the others — better
 * to upgrade what we can than to leave the user stuck.
 *
 * Call once during app startup, ideally inside an effect on the
 * top-level client component. SSR-safe: the inner reads short-
 * circuit when `window` is undefined.
 */
export function runStorageMigrations(): void {
  if (typeof window === "undefined") return;
  const from = readPersistedVersion();
  if (from >= CURRENT_SCHEMA_VERSION) return;

  for (let v = from + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
    const fn = MIGRATIONS[v];
    if (!fn) continue;
    try {
      fn();
      log.info(`storage-migration: ran v${v}`, { area: "migrations", from, to: v });
    } catch (err) {
      log.error(
        `storage-migration: v${v} threw — leaving version stamp at ${v - 1}`,
        { area: "migrations", from, target: v },
        err,
      );
      writePersistedVersion(v - 1);
      return;
    }
  }
  writePersistedVersion(CURRENT_SCHEMA_VERSION);
}

/** Test-only: wipe the version stamp so the next run replays every
 *  migration. Production code never imports this. */
export function __resetSchemaVersionForTests(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.schemaVersion);
  } catch {
    /* ignore */
  }
}
