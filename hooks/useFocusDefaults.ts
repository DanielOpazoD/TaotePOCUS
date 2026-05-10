"use client";

// Admin-managed thumbnail focus defaults — DB-first read with
// localStorage cache + dual-write on every mutation. Mirrors the
// pattern in `useCustomCategoriesData`:
//
//   - On mount: if `IS_NETLIFY_DB_ENABLED`, fetch the singleton row.
//     A non-empty result replaces the local cache; an empty result
//     keeps localStorage intact (covers the "DB just lit up" case).
//   - On every setter: optimistically update local state, mirror the
//     full blob to the server. On a mirror failure we log + leave
//     local untouched; the next reload re-syncs from the DB.
//
// Without the flag the hook degrades to localStorage-only — same
// behaviour as the previous (browser-local) implementation. The DB
// schema lives in `0004_focus_defaults.sql`.
//
// Cross-tab sync: we publish a topic-scoped change event after each
// successful mutation so any other admin tab (or non-admin tab on
// the same browser) re-reads the local cache without waiting for a
// reload.

import { useCallback, useEffect, useRef } from "react";
import { usePersistedState } from "./usePersistedState";
import { useCrossTabSync } from "./useCrossTabSync";
import { dbGetFocusDefaults, dbSetFocusDefaults } from "@/app/actions/db";
import { IS_NETLIFY_DB_ENABLED } from "@/lib/env";
import { log } from "@/lib/log";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { FocusDefaults, FocusValue, SectionId } from "@/lib/types";

const STORAGE_KEY = STORAGE_KEYS.focusDefaults;
const DEFAULT_VALUE: FocusDefaults = {};

/** Defensive validator for a single FocusValue payload. Drops
 *  unrecognised values, clamps the canonical fields to their stated
 *  ranges so a corrupt entry can't render a 1000× zoom or a
 *  -50/-50 object position. Returns `undefined` when no valid
 *  field survives — caller treats that as "slot omitted". */
function sanitizeFocusValue(input: unknown): FocusValue | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const out: FocusValue = {};
  if (typeof raw.x === "number" && Number.isFinite(raw.x)) {
    out.x = Math.max(0, Math.min(100, raw.x));
  }
  if (typeof raw.y === "number" && Number.isFinite(raw.y)) {
    out.y = Math.max(0, Math.min(100, raw.y));
  }
  if (typeof raw.scale === "number" && Number.isFinite(raw.scale)) {
    out.scale = Math.max(0.5, Math.min(3, raw.scale));
  }
  // Empty object is a valid "explicit reset" — keep it so the
  // resolver's slot-present-but-empty semantics survive.
  return out;
}

/** Sanitize a whole `FocusDefaults` blob — used by both the
 *  localStorage deserializer and the DB hydrator. Anything we don't
 *  recognise gets dropped without throwing. */
function sanitizeBlob(input: unknown): FocusDefaults {
  if (!input || typeof input !== "object") return {};
  const obj = input as Record<string, unknown>;
  const next: FocusDefaults = {};

  const global = sanitizeFocusValue(obj.global);
  if (global) next.global = global;

  if (obj.sections && typeof obj.sections === "object") {
    const sections: Partial<Record<SectionId, FocusValue>> = {};
    for (const [k, v] of Object.entries(obj.sections as Record<string, unknown>)) {
      const value = sanitizeFocusValue(v);
      if (value) sections[k as SectionId] = value;
    }
    if (Object.keys(sections).length > 0) next.sections = sections;
  }

  if (obj.categories && typeof obj.categories === "object") {
    const categories: Record<string, FocusValue> = {};
    for (const [k, v] of Object.entries(obj.categories as Record<string, unknown>)) {
      const value = sanitizeFocusValue(v);
      if (value) categories[k] = value;
    }
    if (Object.keys(categories).length > 0) next.categories = categories;
  }

  return next;
}

/** Defensive deserializer for the persisted blob. Anything we don't
 *  recognise gets dropped without throwing — the hook then renders
 *  with `DEFAULT_VALUE` as if the key weren't set. */
function deserialize(raw: string): FocusDefaults | undefined {
  try {
    return sanitizeBlob(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/**
 * Mirror a write to the DB. Returns `true` on success or when the
 * flag is off. Returns `false` on any failure — caller decides
 * what to do (we log + leave local cache as-is so the next reload
 * re-hydrates from the DB).
 */
async function mirror(area: string, value: FocusDefaults): Promise<boolean> {
  if (!IS_NETLIFY_DB_ENABLED) return true;
  try {
    const r = await dbSetFocusDefaults(value);
    if (!r.ok) {
      log.warn(`focus-defaults DB write returned not-ok`, {
        area: `focus-defaults.${area}`,
        reason: r.reason,
      });
      return false;
    }
    return true;
  } catch (err) {
    log.warn(`focus-defaults DB write threw`, { area: `focus-defaults.${area}` }, err);
    return false;
  }
}

/**
 * Admin focus defaults — read + write API.
 *
 * Returns:
 *   - `defaults`: the current `FocusDefaults` blob.
 *   - `setGlobal(value)`: set / clear the global slot.
 *   - `setSection(id, value)`: set / clear a per-section slot. Pass
 *     `undefined` to remove (revert to global / hardcoded).
 *   - `setCategory(id, value)`: set / clear a per-category slot.
 *   - `reset()`: wipe every slot.
 *
 * Each setter writes to localStorage synchronously for a snappy
 * UI, then mirrors the full blob to the DB asynchronously. The DB
 * mirror is fire-and-forget on the happy path — failures log to the
 * Netlify Function output and leave the local state in sync with
 * what the admin sees on screen.
 */
export function useFocusDefaults() {
  const [defaults, setDefaults] = usePersistedState<FocusDefaults>(STORAGE_KEY, DEFAULT_VALUE, {
    deserialize,
  });

  // Latest-blob ref. Multiple setter calls in the same React batch
  // (e.g. `setGlobal(...); setSection(...)` inside one event handler)
  // each see the latest computed value via the ref, so the DB mirror
  // gets the CUMULATIVE blob — not the per-call slice. Without this
  // we'd race the functional-setState closure (queued asynchronously)
  // against the mirror call (fired synchronously).
  const latestRef = useRef<FocusDefaults>(defaults);
  latestRef.current = defaults;

  // Cross-tab sync: any admin write fires a topic event that other
  // tabs / windows observe to re-hydrate from localStorage. Without
  // this, the public-facing pages in another tab would keep showing
  // the old framing until reload.
  const publishChange = useCrossTabSync("focus-defaults", () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setDefaults(DEFAULT_VALUE);
        return;
      }
      const parsed = JSON.parse(raw);
      setDefaults(sanitizeBlob(parsed));
    } catch {
      /* ignore — corrupt JSON falls back to current state */
    }
  });

  // DB hydration: when the flag is on, fetch the singleton row on
  // mount. A non-empty payload replaces the local cache (DB wins as
  // source of truth — Stage 3 from ADR-0011). An empty payload or a
  // network failure leaves localStorage intact.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!IS_NETLIFY_DB_ENABLED || hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const remote = await dbGetFocusDefaults();
        if (cancelled) return;
        const sanitized = sanitizeBlob(remote);
        if (Object.keys(sanitized).length === 0) return; // empty DB → keep local
        setDefaults(sanitized);
      } catch (err) {
        log.warn("focus-defaults DB hydrate threw", { area: "focus-defaults.hydrate" }, err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setDefaults]);

  /** Apply a function to the current blob, persist locally + remotely,
   *  and notify other tabs. Internal helper to deduplicate the three
   *  setters — they each just produce the next blob shape. */
  const apply = useCallback(
    (area: string, mutate: (prev: FocusDefaults) => FocusDefaults) => {
      // Compute the next blob synchronously off the latest ref so
      // multiple back-to-back setter calls see each other's
      // contributions. Update the ref + the React state + mirror to
      // DB in lockstep.
      const next = mutate(latestRef.current);
      latestRef.current = next;
      setDefaults(next);
      void mirror(area, next);
      publishChange();
    },
    [setDefaults, publishChange],
  );

  const setGlobal = useCallback(
    (value: FocusValue | undefined) => {
      apply("setGlobal", (prev) => {
        const out = { ...prev };
        if (value === undefined) delete out.global;
        else out.global = value;
        return out;
      });
    },
    [apply],
  );

  const setSection = useCallback(
    (id: SectionId, value: FocusValue | undefined) => {
      apply("setSection", (prev) => {
        const sections = { ...(prev.sections ?? {}) };
        if (value === undefined) delete sections[id];
        else sections[id] = value;
        const out: FocusDefaults = { ...prev };
        if (Object.keys(sections).length === 0) delete out.sections;
        else out.sections = sections;
        return out;
      });
    },
    [apply],
  );

  const setCategory = useCallback(
    (id: string, value: FocusValue | undefined) => {
      apply("setCategory", (prev) => {
        const categories = { ...(prev.categories ?? {}) };
        if (value === undefined) delete categories[id];
        else categories[id] = value;
        const out: FocusDefaults = { ...prev };
        if (Object.keys(categories).length === 0) delete out.categories;
        else out.categories = categories;
        return out;
      });
    },
    [apply],
  );

  /** Wipe every slot (global + sections + categories). */
  const reset = useCallback(() => {
    apply("reset", () => DEFAULT_VALUE);
  }, [apply]);

  return {
    defaults,
    setGlobal,
    setSection,
    setCategory,
    reset,
  };
}
