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

/**
 * Fire-and-forget DB mirror.
 *
 * ADR-0011 made every other write path DB-authoritative (the DB
 * write blocks; failure surfaces synchronously to the UI; local
 * cache only updates after success). Categories deliberately
 * stay on the prior local-first model because:
 *
 *   1. The mutation API (`addCategory`, `renameCategory`,
 *      `removeCategory`) is synchronous — flipping it to async
 *      would refactor ~5 call sites for a low-stakes seam.
 *   2. Categories are admin-only and tiny (a label + an id).
 *   3. The Backup → "Subir a base de datos" flow can reconcile
 *      drift any time, so a failed mirror isn't user-blocking.
 *
 * The previous `notifyMirrorFailure` toast plumbing is gone (also
 * per ADR-0011); failures are logged, not surfaced. If the
 * categories editor ever grows real-time multi-device sync needs,
 * promote this to the DB-first contract too.
 */
function mirrorDb(area: string, p: Promise<unknown>): void {
  if (!IS_NETLIFY_DB_ENABLED) return;
  void p
    .then((r) => {
      if (r && typeof r === "object" && "ok" in r && (r as { ok: boolean }).ok === false) {
        log.warn(`DB mirror returned not-ok`, { area });
      }
    })
    .catch((err) => {
      log.warn(`DB mirror failed`, { area }, err);
    });
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

  const addCategory = useCallback(
    (label: string) => {
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
      setCustoms([...customs, next]);
      // Mirror to Postgres (best-effort) so the category exists in
      // the DB next time the admin loads from another device.
      mirrorDb("categories.add", dbAddCategory(id, trimmed, null));
      return next;
    },
    [categories, customs, setCustoms],
  );

  const renameCategory = useCallback(
    (id: string, label: string) => {
      if (builtInIds.has(id)) return false; // built-ins are read-only
      const trimmed = label.trim();
      if (!trimmed) return false;
      setCustoms(customs.map((c) => (c.id === id ? { ...c, label: trimmed } : c)));
      mirrorDb("categories.rename", dbRenameCategory(id, trimmed));
      return true;
    },
    [builtInIds, customs, setCustoms],
  );

  const removeCategory = useCallback(
    (id: string) => {
      if (builtInIds.has(id)) return false; // built-ins can't be deleted
      setCustoms(customs.filter((c) => c.id !== id));
      mirrorDb("categories.remove", dbRemoveCategory(id));
      return true;
    },
    [builtInIds, customs, setCustoms],
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
    isCustom,
    /** Predicate: is this category currently hidden from the public
     *  Atlas POCUS view? */
    isHidden,
    /** Toggle visibility. Pass `hidden: true` to hide, `false` to show.
     *  Works for both built-in and custom categories. */
    setHidden,
  };
}
