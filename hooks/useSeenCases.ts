"use client";

/**
 * Per-device "vistos" / seen-case tracker. LocalStorage-backed Set
 * keyed by case id. Marked automatically when the user opens a case
 * modal; surfaces a subtle indicator on the card and powers the
 * "Solo no vistos" toolbar toggle.
 *
 * Why localStorage (not URL state)
 * ────────────────────────────────
 * Seen-state is *personal* and per-device — sharing a link to "my
 * unseen cases" is meaningless, and the user expects their own
 * device's history to follow them across sessions. URL state stays
 * reserved for shareable filter combinations (cat / tags / query).
 *
 * Why localStorage (not IndexedDB)
 * ────────────────────────────────
 * Seen IDs are short strings; even at 5000 cases × ~24 chars per id
 * the payload is ~120 KB, well under localStorage's ~5 MB cap. Sync
 * read/write is fine because the operations are small and infrequent
 * (one write per modal open). IDB would be overkill — extra async
 * surface for a feature that just needs durable set semantics.
 *
 * Cap
 * ───
 * `MAX_ENTRIES` guards against unbounded growth. The seed corpus is
 * ~330 cases, and the catalog supports admin-added ones too, so a
 * 5000-entry cap is generous enough that a daily-driver user never
 * hits it but still bounds the budget if the corpus grows or if a
 * power-user opens cases across every category over years. When
 * full, the oldest insertion is evicted (FIFO via insertion order
 * of a `Set`).
 *
 * Backward compatibility
 * ──────────────────────
 * Read tolerates a missing key (returns empty), invalid JSON
 * (returns empty), and non-array values (returns empty). Writes
 * always serialize as a JSON array. Bumping the schema later means
 * bumping `STORAGE_KEY` so old data isn't silently parsed against
 * a new shape.
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "pocus.seenCases.v1";
const MAX_ENTRIES = 5000;

function readSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    // Coerce to string[] and dedupe via Set construction.
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(seen)));
  } catch {
    // Quota / private mode — best-effort, fail silent. The in-memory
    // state still works for the current session.
  }
}

interface UseSeenCases {
  /** Current set of seen IDs. New `Set` reference per change so
   *  React can detect updates downstream. */
  seen: Set<string>;
  /** Returns true if the id has been marked seen. */
  isSeen: (id: string) => boolean;
  /** Mark an id as seen. Idempotent — already-seen ids re-enter
   *  the FIFO insertion order so they survive eviction longer. */
  markSeen: (id: string) => void;
  /** Wipe the entire history. Used by the settings "borrar
   *  historial de vistos" action. */
  clear: () => void;
}

export function useSeenCases(): UseSeenCases {
  // SSR-safe initial: empty Set on the server, hydrated from
  // localStorage in the first effect. The "no hydration mismatch"
  // contract relies on the consumer never SSR-rendering different
  // markup based on `seen` — which we don't (the indicator is
  // client-only via `data-seen` set after mount).
  const [seen, setSeen] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSeen(readSeen());
  }, []);

  const markSeen = useCallback((id: string) => {
    if (!id) return;
    setSeen((prev) => {
      // Re-inserting keeps the id "fresh" at the end of the Set's
      // iteration order — important for the LRU-style eviction
      // below. `delete + add` is the standard idiom.
      const next = new Set(prev);
      next.delete(id);
      next.add(id);
      // Cap: drop oldest entries (front of iteration) until we're
      // back under the limit. `Set` preserves insertion order, so
      // the first values yielded are the oldest.
      if (next.size > MAX_ENTRIES) {
        const overflow = next.size - MAX_ENTRIES;
        const iter = next.values();
        for (let i = 0; i < overflow; i++) {
          const v = iter.next().value;
          if (v != null) next.delete(v);
        }
      }
      writeSeen(next);
      return next;
    });
  }, []);

  const isSeen = useCallback((id: string) => seen.has(id), [seen]);

  const clear = useCallback(() => {
    setSeen(new Set());
    writeSeen(new Set());
  }, []);

  return { seen, isSeen, markSeen, clear };
}
