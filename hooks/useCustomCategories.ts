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

/**
 * Fire-and-forget DB mirror. Mirrors the helper in `lib/repo.ts` —
 * the local write is the source of truth; the DB sync is best-effort
 * and never blocks the UI. Logged on failure so we know if drift is
 * happening, but the user's mutation is already saved locally.
 */
function mirrorDb(area: string, p: Promise<unknown>): void {
  if (!IS_NETLIFY_DB_ENABLED) return;
  void p
    .then((r) => {
      if (r && typeof r === "object" && "ok" in r && (r as { ok: boolean }).ok === false) {
        log.warn(`DB mirror returned not-ok`, { area });
      }
    })
    .catch((err) => log.warn(`DB mirror failed`, { area }, err));
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

  const builtInIds = useMemo(() => new Set(CATEGORIES.map((c) => c.id)), []);
  const isCustom = useCallback((id: string) => !builtInIds.has(id), [builtInIds]);

  const categories = useMemo<Category[]>(() => [...CATEGORIES, ...customs], [customs]);

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
    categories,
    addCategory,
    renameCategory,
    removeCategory,
    isCustom,
  };
}
