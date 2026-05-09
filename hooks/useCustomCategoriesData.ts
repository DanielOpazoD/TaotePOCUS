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
import { useCrossTabSync } from "./useCrossTabSync";
import { CATEGORIES } from "@/lib/data";
import { IS_NETLIFY_DB_ENABLED } from "@/lib/env";
import { log } from "@/lib/log";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import {
  dbAddCategory,
  dbListCategories,
  dbRenameCategory,
  dbRemoveCategory,
} from "@/app/actions/db";
import type { Category, LocalizedString } from "@/lib/types";

const STORAGE_KEY = STORAGE_KEYS.customCategories;

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

/**
 * Coerce a persisted custom-category label into the modern
 * `LocalizedString` shape. Legacy entries stored a plain string;
 * Phase-3 entries store `{ es; en? }`. Idempotent — already-modern
 * inputs pass through unchanged. Empty / missing inputs become
 * `{ es: "" }` so the renderer never sees `undefined`.
 */
function normalizeCategoryLabel(value: unknown): LocalizedString {
  if (typeof value === "string") return { es: value };
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const es = typeof obj.es === "string" ? obj.es : "";
    const out: LocalizedString = { es };
    if (typeof obj.en === "string" && obj.en.length > 0) out.en = obj.en;
    return out;
  }
  return { es: "" };
}

/** Read the ES slot from a `Category.label` regardless of legacy /
 *  modern shape. Used by the duplicate-detection guard on add. */
function categoryLabelEs(label: Category["label"]): string {
  return typeof label === "string" ? label : (label.es ?? "");
}

export interface UseCustomCategoriesDataResult {
  /** Custom-only list (excludes the eight built-ins). */
  customCategories: Category[];
  /** Built-in + custom merged list, in display order. */
  categories: Category[];
  /**
   * Add a custom category. The single-arg signature kept for
   * back-compat builds the ES slot only; the dual-arg variant
   * (`{ es; en? }`) lets the admin populate both languages at
   * creation time.
   */
  addCategory: (label: string | LocalizedString) => Promise<Category | null>;
  renameCategory: (id: string, label: string | LocalizedString) => Promise<boolean>;
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
        // Labels can be either a non-empty string (legacy) or a
        // `LocalizedString` object with a non-empty `es` slot
        // (Phase-3+); we normalize on output so consumers always see
        // the modern bilingual shape.
        return arr
          .filter((x) => {
            if (!x || typeof x.id !== "string" || x.id.length === 0) return false;
            if (typeof x.label === "string" && x.label.length > 0) return true;
            if (
              x.label &&
              typeof x.label === "object" &&
              typeof x.label.es === "string" &&
              x.label.es.length > 0
            ) {
              return true;
            }
            return false;
          })
          .map((x) => ({
            id: x.id as string,
            label: normalizeCategoryLabel(x.label),
          }));
      } catch {
        return undefined;
      }
    },
  });

  const builtInIds = useMemo(() => new Set(CATEGORIES.map((c) => c.id)), []);
  const isCustom = useCallback((id: string) => !builtInIds.has(id), [builtInIds]);

  const categories = useMemo<Category[]>(() => [...CATEGORIES, ...customs], [customs]);

  // Cross-tab sync. Adding / renaming / removing a custom category
  // in one admin tab now refreshes the list in any other open tab
  // immediately. Without this, the sidebar's category nav and the
  // CategoriesEditor's row list could drift between tabs until F5.
  //
  // The listener re-reads from `usePersistedState`'s underlying
  // localStorage by re-applying the deserialize logic via setCustoms
  // (we re-fetch the array from storage and set it back into state).
  const publishCategoriesChange = useCrossTabSync("categories", () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setCustoms([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      // Same shape acceptance as the initial deserialize: legacy
      // plain-string labels coexist with the Phase-3 LocalizedString.
      const safe: Category[] = [];
      for (const x of parsed) {
        if (!x || typeof x.id !== "string" || x.id.length === 0) continue;
        const labelOk =
          (typeof x.label === "string" && x.label.length > 0) ||
          (x.label &&
            typeof x.label === "object" &&
            typeof x.label.es === "string" &&
            x.label.es.length > 0);
        if (!labelOk) continue;
        safe.push({ id: x.id, label: normalizeCategoryLabel(x.label) });
      }
      setCustoms(safe);
    } catch {
      /* ignore — corrupt JSON falls back to current state */
    }
  });

  // DB hydration: when the flag is on, fetch the DB's categories on
  // mount and replace the local state if the DB has anything. Empty
  // DB keeps localStorage intact (covers the "flag just turned on"
  // scenario where the DB hasn't been seeded yet).
  //
  // The DB still persists the legacy plain-string label (Phase-3 keeps
  // the DB schema unchanged for now); we normalize on the client so
  // downstream consumers see the modern bilingual shape. EN
  // translations live only in localStorage until a future migration
  // promotes them to a DB column.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!IS_NETLIFY_DB_ENABLED || hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const dbCats = await dbListCategories();
        if (!cancelled && dbCats.length > 0) {
          setCustoms(dbCats.map((c) => ({ id: c.id, label: normalizeCategoryLabel(c.label) })));
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
    async (label: string | LocalizedString): Promise<Category | null> => {
      const localized = normalizeCategoryLabel(label);
      const trimmedEs = localized.es.trim();
      const trimmedEn = localized.en?.trim() ?? "";
      if (!trimmedEs) return null;
      // Reject duplicates by ES label (case-insensitive) — the admin
      // probably meant to reuse the existing one. The ES slot is the
      // mandatory baseline, so it's the right axis for collision.
      const existing = categories.find(
        (c) => categoryLabelEs(c.label).toLowerCase() === trimmedEs.toLowerCase(),
      );
      if (existing) return null;

      // Disambiguate id collisions (rare, but two labels with the
      // same diacritic-stripped form would otherwise clash). Slug is
      // derived from the ES baseline; the EN translation is purely
      // cosmetic for the user-facing label.
      const baseId = slugifyLabel(trimmedEs);
      let id = baseId;
      let n = 2;
      while (categories.some((c) => c.id === id)) {
        id = `${baseId}-${n++}`;
      }
      const nextLabel: LocalizedString = trimmedEn
        ? { es: trimmedEs, en: trimmedEn }
        : { es: trimmedEs };
      const next: Category = { id, label: nextLabel };
      // The DB schema only stores the ES slot today (a future
      // migration can promote `label` to JSONB). The EN translation
      // lives in localStorage; the cross-tab listener and re-hydrate
      // logic handles the fan-out.
      const ok = await awaitDb("categories.add", () => dbAddCategory(id, trimmedEs, null));
      if (!ok) return null;
      setCustoms([...customs, next]);
      publishCategoriesChange();
      return next;
    },
    [categories, customs, setCustoms, publishCategoriesChange],
  );

  const renameCategory = useCallback(
    async (id: string, label: string | LocalizedString): Promise<boolean> => {
      if (builtInIds.has(id)) return false;
      const localized = normalizeCategoryLabel(label);
      const trimmedEs = localized.es.trim();
      const trimmedEn = localized.en?.trim() ?? "";
      if (!trimmedEs) return false;
      // Same DB-schema caveat as `addCategory`: only ES persists in
      // Postgres for now.
      const ok = await awaitDb("categories.rename", () => dbRenameCategory(id, trimmedEs));
      if (!ok) return false;
      const nextLabel: LocalizedString = trimmedEn
        ? { es: trimmedEs, en: trimmedEn }
        : { es: trimmedEs };
      setCustoms(customs.map((c) => (c.id === id ? { ...c, label: nextLabel } : c)));
      publishCategoriesChange();
      return true;
    },
    [builtInIds, customs, setCustoms, publishCategoriesChange],
  );

  const removeCategory = useCallback(
    async (id: string): Promise<boolean> => {
      if (builtInIds.has(id)) return false;
      const ok = await awaitDb("categories.remove", () => dbRemoveCategory(id));
      if (!ok) return false;
      setCustoms(customs.filter((c) => c.id !== id));
      publishCategoriesChange();
      return true;
    },
    [builtInIds, customs, setCustoms, publishCategoriesChange],
  );

  // Re-add at the previous id + label. Distinct from `addCategory`,
  // which generates a fresh slug from a label. Postgres
  // `ON CONFLICT DO NOTHING` makes the DB call idempotent if the
  // row somehow survived. The DB write only carries the ES slot;
  // the localStorage entry preserves the bilingual shape so the EN
  // translation survives the round trip on the same browser.
  const restoreCategory = useCallback(
    async (cat: Category): Promise<boolean> => {
      const restoredLabel = normalizeCategoryLabel(cat.label);
      const ok = await awaitDb("categories.restore", () =>
        dbAddCategory(cat.id, restoredLabel.es, null),
      );
      if (!ok) return false;
      const restored: Category = { id: cat.id, label: restoredLabel };
      setCustoms((prev) => (prev.some((c) => c.id === cat.id) ? prev : [...prev, restored]));
      publishCategoriesChange();
      return true;
    },
    [setCustoms, publishCategoriesChange],
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
