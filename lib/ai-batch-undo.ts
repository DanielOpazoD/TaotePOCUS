// "Undo last AI batch" infrastructure. Stores a snapshot of the
// CASE STATE BEFORE the AI applied its patch, per case, in
// localStorage. After a successful bulk-rewrite (or even a
// single-case auto-save), the admin can click "Deshacer último
// batch" within the TTL window and the table fires a restore
// patch per case.
//
// **Why localStorage**: same rationale as `lib/media-cache.ts` —
// the data is per-device, short-lived, and reverting is a manual
// admin action, not a cross-device requirement. If two admins
// edited from different machines, each gets their own undo buffer
// (which is also the safest thing — one admin's undo shouldn't
// reach across another admin's session).
//
// **TTL**: 24 hours. After that the buffer is garbage-collected on
// the next read. The window is long enough that an admin can come
// back from lunch and undo, but short enough that we don't
// accumulate stale revert offers from days ago.
//
// **Single slot**: only the LAST batch is kept. A second batch
// overwrites the first. The user's complaint was "I did a bulk and
// 5 came out wrong" — they wanted to revert the last operation,
// not navigate a history. Multi-level undo would balloon the
// localStorage footprint and the UX (which one am I reverting?).

import type { CaseRecord, LocalizedString, LocalizedTags, TranslationMeta } from "./types";

const STORAGE_KEY = "taote.ai.lastBatch";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Operations that produce a reversible AI batch. Used for the
 *  human-readable label on the undo banner ("Deshacer último
 *  reescribir AI" vs "Deshacer última traducción"). */
export type AIBatchOperation = "rewrite" | "translate";

/** A single case's snapshot inside a batch. Only the fields the AI
 *  is allowed to overwrite are captured — the patch surface is
 *  limited so we don't accidentally revert unrelated edits the
 *  admin made between the AI run and the undo click. */
export interface AIBatchEntry {
  caseId: string;
  /** Snapshot of the case fields BEFORE the AI patch. The undo
   *  applies this object as a patch, restoring those slots to
   *  their pre-AI state. Fields the AI didn't touch stay
   *  undefined here. */
  before: {
    title?: LocalizedString;
    description?: LocalizedString;
    tags?: LocalizedTags;
    translationMeta?: TranslationMeta;
  };
}

export interface AIBatch {
  batchId: string;
  /** Wall-clock when the batch was committed. Used for TTL + the
   *  "hace X minutos" label in the banner. */
  appliedAt: number;
  operation: AIBatchOperation;
  entries: AIBatchEntry[];
}

/**
 * Capture the BEFORE state of a case so a later undo can restore it.
 * Caller passes the current case record; we extract only the fields
 * the AI typically rewrites.
 */
export function entryFromCase(caso: CaseRecord): AIBatchEntry {
  return {
    caseId: caso.id,
    before: {
      // Spread to clone, so a later in-memory mutation of `caso`
      // (rare but possible during fast admin edits) doesn't poison
      // the stored snapshot.
      title: { ...caso.title },
      description: { ...caso.description },
      tags: {
        es: [...caso.tags.es],
        ...(caso.tags.en !== undefined ? { en: [...caso.tags.en] } : {}),
      },
      ...(caso.translationMeta !== undefined
        ? { translationMeta: { ...caso.translationMeta } }
        : {}),
    },
  };
}

/**
 * Persist a batch as "the last AI operation". Overwrites any prior
 * batch. Failures are swallowed — localStorage being unavailable
 * means we just don't offer undo, which is no worse than before
 * this feature existed.
 */
export function rememberAIBatch(operation: AIBatchOperation, entries: AIBatchEntry[]): void {
  if (typeof window === "undefined") return;
  if (entries.length === 0) return;
  const batch: AIBatch = {
    batchId: `${operation}-${Date.now()}`,
    appliedAt: Date.now(),
    operation,
    entries,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(batch));
  } catch {
    // Quota / disabled — ignore.
  }
}

/**
 * Read the last batch, dropping it if expired. Returns null when
 * there's no batch in scope, the JSON is malformed, or the TTL has
 * passed.
 */
export function getLastAIBatch(): AIBatch | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Bad JSON — wipe it so we don't keep failing on the same byte
    // stream.
    clearLastAIBatch();
    return null;
  }
  if (!isAIBatch(parsed)) {
    clearLastAIBatch();
    return null;
  }
  if (Date.now() - parsed.appliedAt > TTL_MS) {
    // Expired — drop on read so subsequent reads stay fast.
    clearLastAIBatch();
    return null;
  }
  return parsed;
}

/** Wipe the persisted batch. Called after a successful undo OR
 *  when expired data is detected on read. */
export function clearLastAIBatch(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Defensive type guard. The localStorage value passed through
 * `JSON.parse(raw)` is `unknown` — we narrow it field by field
 * before trusting the shape. Without this a malformed write
 * (manual tampering, schema change) would crash the undo banner.
 */
function isAIBatch(v: unknown): v is AIBatch {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj.batchId !== "string") return false;
  if (typeof obj.appliedAt !== "number") return false;
  if (obj.operation !== "rewrite" && obj.operation !== "translate") return false;
  if (!Array.isArray(obj.entries)) return false;
  for (const entry of obj.entries) {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Record<string, unknown>;
    if (typeof e.caseId !== "string") return false;
    if (!e.before || typeof e.before !== "object") return false;
  }
  return true;
}

/**
 * Test helper. Production code should never need to manually wipe
 * the cache — `clearLastAIBatch` is the right surface for that.
 */
export function clearAIBatchUndoForTests(): void {
  clearLastAIBatch();
}
