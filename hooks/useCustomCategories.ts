"use client";

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
const HIDDEN_KEY = "hiddenCategoryIds";

type ActionResult = { ok: true } | { ok: false; reason: "unknown" | "auth_required" | "forbidden" };

/**
 * Run a DB Server Action and wait for the result. Returns `true`
 * on success or when the flag is off (no DB to talk to). Returns
 * `false` on any failure — the caller leaves the local state
 * untouched. The previous "fire-and-forget mirror" pattern is gone
 * (per ADR-0011 follow-up): the categories carve-out is closed.
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
 * `c:` so they never collide with the built-in literal union
 * (`cardiac`, `lung`, …) and are easy to spot in storage / logs.
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

/**
 * Admin-managed custom categories. Persisted in localStorage and
 * merged with the built-in `CATEGORIES` from `lib/data.ts` so the
 * classifier board, case form, and any other consumer see one unified
 * list.
 *
 * Why a hook (vs. a global module-level array): persistence wants to
 * react to localStorage changes after hydration, and consumers need
 * a stable reference that re-renders on add/rename/remove.
 *
 * The two lists are kept apart on disk:
 *   - `CATEGORIES` (built-in) lives in code, immutable.
 *   - Custom ones live in `localStorage["customCategories"]`.
 *
 * The merge order — built-ins first, customs after — preserves the
 * historical order of the eight medical categories at the top of any
 * picker, with the admin's additions appended.
 *
 * Returns:
 *   - `customCategories`: the custom-only list.
 *   - `categories`: the merged (built-in + custom) list.
 *   - `addCategory(label)`: append a new custom category. Returns the
 *     created `Category` or `null` for an empty/duplicate label.
 *   - `renameCategory(id, label)`: update the label of a custom
 *     category. Built-in ids are rejected.
 *   - `removeCategory(id)`: drop a custom category. Built-in ids are
 *     rejected.
 *   - `isCustom(id)`: predicate for "this id was created at runtime".
 */
export function useCustomCategories() {
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

  // Hidden categories — admin can mark any category (built-in or
  // custom) as hidden; it stays in the catalog (cases keep their
  // assignment) but doesn't appear in the public Atlas POCUS sidebar.
  // Useful for trimming the nav when a built-in like "Obstétrico"
  // has very few cases the admin doesn't want to surface.
  //
  // Persisted as a string[] so a corrupt entry (non-string) just
  // gets dropped without crashing the editor.
  const [hiddenIds, setHiddenIds] = usePersistedState<string[]>(HIDDEN_KEY, [], {
    deserialize: (raw) => {
      try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return undefined;
        return arr.filter((x): x is string => typeof x === "string" && x.length > 0);
      } catch {
        return undefined;
      }
    },
  });

  const builtInIds = useMemo(() => new Set(CATEGORIES.map((c) => c.id)), []);
  const isCustom = useCallback((id: string) => !builtInIds.has(id), [builtInIds]);

  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const isHidden = useCallback((id: string) => hiddenSet.has(id), [hiddenSet]);
  const setHidden = useCallback(
    (id: string, hidden: boolean) => {
      const next = hidden
        ? Array.from(new Set([...hiddenIds, id]))
        : hiddenIds.filter((x) => x !== id);
      setHiddenIds(next);
    },
    [hiddenIds, setHiddenIds],
  );

  const categories = useMemo<Category[]>(() => [...CATEGORIES, ...customs], [customs]);
  // Filtered list used by public surfaces (sidebar, hero, etc.).
  // Admin views still get the full `categories` so the editor can
  // toggle visibility on hidden ones.
  const visibleCategories = useMemo<Category[]>(
    () => categories.filter((c) => !hiddenSet.has(c.id)),
    [categories, hiddenSet],
  );

  // DB hydration. Stage 3 — when the flag is on, fetch the DB's
  // categories on mount and replace the local state if the DB has
  // anything. The empty-DB case keeps localStorage intact (covers
  // the "flag just turned on, DB hasn't been seeded" scenario).
  //
  // Runs once per mount. The `usePersistedState` hook mirrors the
  // setCustoms call back to localStorage automatically, so the cache
  // stays fresh without an extra write.
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

  // ─── Mutations: DB-first, async ────────────────────────────────
  // Per ADR-0011's follow-up: the categories carve-out is closed.
  // Every mutation now awaits the DB Server Action; on failure the
  // local cache stays unchanged so it doesn't drift from Postgres.
  // This is the same shape as the cases path (`dbThenLocal` in
  // `lib/repo/dual-write.ts`); inlined here because the categories
  // hook owns its own local state directly via `usePersistedState`.

  const addCategory = useCallback(
    async (label: string): Promise<Category | null> => {
      const trimmed = label.trim();
      if (!trimmed) return null;
      // Reject duplicates by label (case-insensitive) — the admin
      // probably meant to reuse the existing one.
      const existing = categories.find((c) => c.label.toLowerCase() === trimmed.toLowerCase());
      if (existing) return null;

      // Disambiguate id collisions (rare, but two labels with the same
      // diacritic-stripped form would otherwise clash).
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
      if (builtInIds.has(id)) return false; // built-ins are read-only
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
      if (builtInIds.has(id)) return false; // built-ins can't be deleted
      const ok = await awaitDb("categories.remove", () => dbRemoveCategory(id));
      if (!ok) return false;
      setCustoms(customs.filter((c) => c.id !== id));
      return true;
    },
    [builtInIds, customs, setCustoms],
  );

  // Re-add a category at its previous id + label. Used by the undo
  // path on `removeCategory`: capture the deleted entry, click
  // "Deshacer", and we recreate it with the same id (Postgres
  // `ON CONFLICT DO NOTHING` makes the DB call idempotent if the
  // row somehow survived). Distinct from `addCategory`, which
  // generates a fresh slug from a label.
  const restoreCategory = useCallback(
    async (cat: Category): Promise<boolean> => {
      const ok = await awaitDb("categories.restore", () => dbAddCategory(cat.id, cat.label, null));
      if (!ok) return false;
      // Insert back at the end. Order isn't a hard contract — the
      // admin can rearrange via rename at any time — and re-inserting
      // at the original index would require capturing it pre-remove
      // for what's a rare flow.
      setCustoms((prev) => (prev.some((c) => c.id === cat.id) ? prev : [...prev, cat]));
      return true;
    },
    [setCustoms],
  );

  return {
    customCategories: customs,
    /** Built-in + custom (full set, including hidden). Use this in the
     *  Categories editor where the admin is managing visibility. */
    categories,
    /** Built-in + custom MINUS hidden ones. Use this in public-facing
     *  surfaces (sidebar nav, hero, classifier dropdowns). */
    visibleCategories,
    addCategory,
    renameCategory,
    removeCategory,
    /** Inverse of `removeCategory` — recreates a category at its
     *  previous id + label. Used by the undo toast path. */
    restoreCategory,
    isCustom,
    /** Predicate: is this category currently hidden from the public
     *  Atlas POCUS view? */
    isHidden,
    /** Toggle visibility. Pass `hidden: true` to hide, `false` to show.
     *  Works for both built-in and custom categories. */
    setHidden,
  };
}
