"use client";

// CRUD + DB hydration for admin-managed custom categories. The
// counterpart to the static built-in `CATEGORIES` from `lib/data.ts`.
//
// Each mutation is **DB-first, async** (per ADR-0011 follow-up):
// the function awaits the Server Action, then mirrors success into
// localStorage. On failure the local cache stays untouched so it
// doesn't drift from Postgres.
//
// Lifted out of the previous `useCustomCategories` monolith in
// May-2026. The visibility surface (`isHidden`/`setHidden`) lives
// in `useCategoryVisibility`; consumers that need both compose
// `useCustomCategories` (the public composing hook) which combines
// the two.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePersistedState } from "./usePersistedState";
import { CATEGORIES } from "@/lib/data";
import { IS_NETLIFY_DB_ENABLED } from "@/lib/env";
import { log } from "@/lib/log";
import {
  dbAddCategory,
  dbListCategories,
  dbRenameCategory,
  dbRemoveCategory,
} from "@/app/actions/db";
import type { Category } from "@/lib/types";

const STORAGE_KEY = "customCategories";

type ActionResult = { ok: true } | { ok: false; reason: "unknown" | "auth_required" | "forbidden" };

/**
 * Run a DB Server Action and wait for the result. Returns `true`
 * on success or when the flag is off (no DB to talk to). Returns
 * `false` on any failure — the caller leaves the local state
 * untouched.
 */
async function awaitDb(area: string, run: () => Promise<ActionResult>): Promise<boolean> {
  if (!IS_NETLIFY_DB_ENABLED) return true;
  try {
    const r = await run();
    if (!r.ok) {
      log.warn(`DB write returned not-ok`, { area, reason: r.reason });
      return false;
    }
    return true;
  } catch (err) {
    log.warn(`DB write threw`, { area }, err);
    return false;
  }
}

/**
 * Slug-style id derived from a label. Custom ids are prefixed with
 * `c:` so they never collide with the built-in literal union.
 *
 * Diacritics are stripped (NFD + combining-mark removal) so accented
 * Spanish labels round-trip into stable ASCII ids:
 *   "Pediatría" → "c:pediatria"
 *   "Vía aérea" → "c:via-aerea"
 */
function slugifyLabel(label: string): string {
  const base = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `c:${base || "categoria"}`;
}

export interface UseCustomCategoriesDataResult {
  /** Custom-only list (excludes the eight built-ins). */
  customCategories: Category[];
  /** Built-in + custom merged list, in display order. */
  categories: Category[];
  addCategory: (label: string) => Promise<Category | null>;
  renameCategory: (id: string, label: string) => Promise<boolean>;
  removeCategory: (id: string) => Promise<boolean>;
  /** Re-add a category at its previous id + label. Used by the
   *  undo path on `removeCategory`. */
  restoreCategory: (cat: Category) => Promise<boolean>;
  /** Predicate: was this id created at runtime (vs. built-in)? */
  isCustom: (id: string) => boolean;
}

export function useCustomCategoriesData(): UseCustomCategoriesDataResult {
  const [customs, setCustoms] = usePersistedState<Category[]>(STORAGE_KEY, [], {
    deserialize: (raw) => {
      try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return undefined;
        // Defensive: drop anything that doesn't look like a Category
        // so a corrupt entry doesn't crash the whole admin panel.
        return arr.filter(
          (x) =>
            x &&
            typeof x.id === "string" &&
            typeof x.label === "string" &&
            x.id.length > 0 &&
            x.label.length > 0,
        );
      } catch {
        return undefined;
      }
    },
  });

  const builtInIds = useMemo(() => new Set(CATEGORIES.map((c) => c.id)), []);
  const isCustom = useCallback((id: string) => !builtInIds.has(id), [builtInIds]);

  const categories = useMemo<Category[]>(() => [...CATEGORIES, ...customs], [customs]);

  // DB hydration: when the flag is on, fetch the DB's categories on
  // mount and replace the local state if the DB has anything. Empty
  // DB keeps localStorage intact (covers the "flag just turned on"
  // scenario where the DB hasn't been seeded yet).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!IS_NETLIFY_DB_ENABLED || hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const dbCats = await dbListCategories();
        if (!cancelled && dbCats.length > 0) {
          setCustoms(dbCats);
        }
      } catch (err) {
        log.warn("Categories DB hydration failed", { area: "categories" }, err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setCustoms]);

  const addCategory = useCallback(
    async (label: string): Promise<Category | null> => {
      const trimmed = label.trim();
      if (!trimmed) return null;
      // Reject duplicates by label (case-insensitive) — the admin
      // probably meant to reuse the existing one.
      const existing = categories.find((c) => c.label.toLowerCase() === trimmed.toLowerCase());
      if (existing) return null;

      // Disambiguate id collisions (rare, but two labels with the
      // same diacritic-stripped form would otherwise clash).
      const baseId = slugifyLabel(trimmed);
      let id = baseId;
      let n = 2;
      while (categories.some((c) => c.id === id)) {
        id = `${baseId}-${n++}`;
      }
      const next: Category = { id, label: trimmed };
      const ok = await awaitDb("categories.add", () => dbAddCategory(id, trimmed, null));
      if (!ok) return null;
      setCustoms([...customs, next]);
      return next;
    },
    [categories, customs, setCustoms],
  );

  const renameCategory = useCallback(
    async (id: string, label: string): Promise<boolean> => {
      if (builtInIds.has(id)) return false;
      const trimmed = label.trim();
      if (!trimmed) return false;
      const ok = await awaitDb("categories.rename", () => dbRenameCategory(id, trimmed));
      if (!ok) return false;
      setCustoms(customs.map((c) => (c.id === id ? { ...c, label: trimmed } : c)));
      return true;
    },
    [builtInIds, customs, setCustoms],
  );

  const removeCategory = useCallback(
    async (id: string): Promise<boolean> => {
      if (builtInIds.has(id)) return false;
      const ok = await awaitDb("categories.remove", () => dbRemoveCategory(id));
      if (!ok) return false;
      setCustoms(customs.filter((c) => c.id !== id));
      return true;
    },
    [builtInIds, customs, setCustoms],
  );

  // Re-add at the previous id + label. Distinct from `addCategory`,
  // which generates a fresh slug from a label. Postgres
  // `ON CONFLICT DO NOTHING` makes the DB call idempotent if the
  // row somehow survived.
  const restoreCategory = useCallback(
    async (cat: Category): Promise<boolean> => {
      const ok = await awaitDb("categories.restore", () => dbAddCategory(cat.id, cat.label, null));
      if (!ok) return false;
      setCustoms((prev) => (prev.some((c) => c.id === cat.id) ? prev : [...prev, cat]));
      return true;
    },
    [setCustoms],
  );

  return {
    customCategories: customs,
    categories,
    addCategory,
    renameCategory,
    removeCategory,
    restoreCategory,
    isCustom,
  };
}
