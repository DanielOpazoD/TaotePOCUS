// Backup / restore utilities. Pure functions over localStorage so the
// admin can save their classification work to a JSON file (and recover
// it on a fresh browser, after `Clear site data`, or after deploy of
// a different origin).

import { STORAGE_KEYS, FAVS_KEY_PREFIX, favsKey } from "./storage-keys";
//
// The bundle covers everything the admin can produce manually:
//
//   - `caseOverrides` — per-case reclassifications (sección, categoría,
//     reviewed flag, soft-delete tombstones). The most valuable bucket.
//   - `userCases` — admin-uploaded cases (live + trashed).
//   - `favs` — favorites list.
//   - `customCategories` — admin-defined categories.
//
// Session state (`pocus_user`) and UI prefs (`sidebarCollapsed`,
// `tagsOpen`) are deliberately NOT in the bundle — they're per-device
// and short-lived; restoring them across browsers would be wrong.
//
// Format is versioned so future schema changes can migrate without
// silently dropping fields. Today version is 1.

export interface BackupEnvelope {
  /** Bumped on incompatible schema changes; readers must check. */
  version: 1;
  /** ISO timestamp the bundle was produced. */
  exportedAt: string;
  /** Email of the admin (best-effort, can be `null` for guest). */
  exportedBy: string | null;
  /** Human-readable summary so an inspector can verify the file
   *  before importing. Not authoritative — the importer recomputes. */
  summary: {
    overrides: number;
    customCategories: number;
    favorites: number;
    userCases: number;
  };
  /** The actual restorable state. Keys mirror the localStorage
   *  layout one-to-one; values are the parsed JSON of each entry. */
  data: {
    caseOverrides: Record<string, unknown>;
    customCategories: unknown[];
    favsByEmail: Record<string, string[]>;
    userCases: unknown[];
  };
}

/**
 * Result of importing a bundle. Counts what was restored so the UI
 * can show "Restauré 47 reclasificaciones, 3 categorías, 12 favoritos".
 */
export interface RestoreResult {
  ok: boolean;
  reason?: "invalid-json" | "wrong-version" | "missing-data" | "write-failed";
  counts?: {
    overrides: number;
    customCategories: number;
    favsEmails: number;
    userCases: number;
  };
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a backup bundle from the current localStorage. Pure read —
 * no side effects. Returns a fully-populated envelope ready to be
 * stringified and downloaded.
 *
 * Favorites are keyed by email in storage (`pocus_favs_<email>`), so
 * we walk all `pocus_favs_*` entries to capture every account that
 * has ever logged in on this browser. The guest bucket is included
 * under the synthetic email `"guest"`.
 */
export function buildBackup(currentEmail: string | null = null): BackupEnvelope {
  const caseOverrides = readJson<Record<string, unknown>>(STORAGE_KEYS.caseOverrides, {});
  const userCases = readJson<unknown[]>(STORAGE_KEYS.userCases, []);
  const customCategories = readJson<unknown[]>(STORAGE_KEYS.customCategories, []);

  const favsByEmail: Record<string, string[]> = {};
  if (typeof localStorage !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(FAVS_KEY_PREFIX)) continue;
      const email = k.slice(FAVS_KEY_PREFIX.length);
      favsByEmail[email] = readJson<string[]>(k, []);
    }
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: currentEmail,
    summary: {
      overrides: Object.keys(caseOverrides).length,
      customCategories: Array.isArray(customCategories) ? customCategories.length : 0,
      favorites: Object.values(favsByEmail).reduce((acc, list) => acc + list.length, 0),
      userCases: Array.isArray(userCases) ? userCases.length : 0,
    },
    data: { caseOverrides, customCategories, favsByEmail, userCases },
  };
}

/**
 * Validate an unknown blob and return it as a `BackupEnvelope` if it
 * matches the expected shape. Returns `null` (not throws) so the UI
 * can branch on bad input without try/catch sprawl.
 */
export function parseBackup(raw: unknown): BackupEnvelope | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<BackupEnvelope>;
  if (candidate.version !== 1) return null;
  if (!candidate.data || typeof candidate.data !== "object") return null;
  const d = candidate.data as Partial<BackupEnvelope["data"]>;
  if (!d.caseOverrides || typeof d.caseOverrides !== "object") return null;
  if (!d.favsByEmail || typeof d.favsByEmail !== "object") return null;
  if (!Array.isArray(d.userCases)) return null;
  if (!Array.isArray(d.customCategories)) return null;
  return candidate as BackupEnvelope;
}

/**
 * Replace localStorage state with the contents of an envelope.
 *
 * Strategy is REPLACE, not merge: the admin's expectation when they
 * click Importar is "make this match the file". A merge would be
 * confusing and create silent conflict-resolution rules. If they
 * want to combine snapshots, they can edit the JSON manually before
 * importing — that's the escape hatch.
 *
 * The user's session (`pocus_user`) and UI prefs are left untouched
 * because they aren't in the bundle anyway.
 *
 * Returns counts of what was actually written so the UI can confirm.
 */
export function restoreBackup(env: BackupEnvelope): RestoreResult {
  if (env.version !== 1) {
    return { ok: false, reason: "wrong-version" };
  }

  // Wipe existing favs first so old emails not present in the bundle
  // are dropped. We deliberately don't wipe userCases / overrides /
  // categories key-by-key — `writeJson` overwrites them whole.
  if (typeof localStorage !== "undefined") {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(FAVS_KEY_PREFIX)) localStorage.removeItem(k);
    }
  }

  const writes: boolean[] = [
    writeJson(STORAGE_KEYS.caseOverrides, env.data.caseOverrides),
    writeJson(STORAGE_KEYS.userCases, env.data.userCases),
    writeJson(STORAGE_KEYS.customCategories, env.data.customCategories),
  ];
  let favsEmails = 0;
  for (const [email, list] of Object.entries(env.data.favsByEmail)) {
    writes.push(writeJson(favsKey(email), list));
    favsEmails += 1;
  }

  if (writes.some((w) => !w)) {
    return { ok: false, reason: "write-failed" };
  }

  return {
    ok: true,
    counts: {
      overrides: Object.keys(env.data.caseOverrides).length,
      customCategories: env.data.customCategories.length,
      favsEmails,
      userCases: env.data.userCases.length,
    },
  };
}

/**
 * Suggested filename for a download. Stable shape so the admin's
 * Drive / Dropbox picks them up in chronological order without
 * extra metadata: `pocus-backup-2026-04-29-1432.json`.
 */
export function defaultBackupFilename(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `pocus-backup-${stamp}.json`;
}
