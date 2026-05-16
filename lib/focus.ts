// Resolver for the thumbnail focal-point + zoom system. Read by
// `<CaseCard>` to compute the effective focus for each thumbnail.
//
// Resolution order (narrowest first wins):
//
//   1. `caso.focus` — per-case override set via the AdminThumbMenu
//      focus editor. The most specific layer; bypasses every default.
//   2. `defaults.categories[caso.category]` — per-category default
//      managed by the admin in `FocusDefaultsPanel`.
//   3. `defaults.sections[caso.section]` — per-section default.
//   4. `defaults.global` — site-wide default.
//   5. (implicit at render) `{ x: 50, y: 50, scale: 1 }` — hardcoded
//      center / no zoom. The CineLoop already supplies these defaults
//      when its `focus` prop is undefined, so the resolver returns
//      `undefined` here rather than re-emitting the literal — keeps
//      the prop shape minimal for unchanged thumbnails.
//
// This file is pure (no React, no DOM). The corresponding hook,
// `useFocusDefaults`, owns persistence and cross-tab sync; this file
// is just the resolver, deliberately small so the unit test pins
// behaviour without mocking storage.

import type { CaseRecord, FocusDefaults, FocusValue, SectionId } from "@/lib/types";

/**
 * Built-in section presets — a final fallback layer between the
 * admin-managed `defaults.sections` and the global / hardcoded
 * defaults. Use ONLY for shape-of-data fixes that the import
 * pipeline can't address on its own, never for editorial overrides
 * (those belong in the admin panel).
 *
 * `ecg`: every imported Twitter ECG ships with a ~40-50% black
 * letterbox band on top (the tweet header / timestamp area) and the
 * actual paper at the bottom. A 50/50 `object-position` on a 1:1
 * card lands the cell squarely inside that black band — the
 * thumbnail reads as "broken / empty" and the reader has to open
 * the modal to confirm there's an ECG inside. Biasing the focal
 * point down to y=85 lifts the paper into view; the slight
 * scale=1.1 zoom trims the residual sliver at the top edge so the
 * card is dominated by ECG instead of letterbox. Admin overrides
 * (per-section or per-case) still win — this is just a sensible
 * baseline for fresh installs.
 */
const SECTION_PRESETS: Partial<Record<SectionId, FocusValue>> = {
  ecg: { y: 85, scale: 1.1 },
};

/**
 * Resolve the effective `FocusValue` for a case against the admin's
 * focus-default config. Returns `undefined` when no slot in the
 * resolution chain produces a value — the renderer's hard-coded
 * defaults (`{ x:50, y:50, scale:1 }`) take over from there.
 *
 * Semantics:
 *   - The first non-undefined slot wins; later slots are not merged.
 *     A category default with only `{ scale: 1.2 }` does NOT inherit
 *     `x`/`y` from a section default — the chain is "first complete
 *     hit", not "deep merge". This matches per-case overrides
 *     (`caso.focus = { scale: 1.2 }` shows centered + zoomed because
 *     the renderer fills missing `x`/`y` with 50/50).
 *   - A slot present but empty (`{}`) is treated as a hit (returns
 *     `{}`) so the admin can deliberately reset a category back to
 *     "centered/no-zoom" without inheriting a wider scope's value.
 *     If the admin wants the slot to fall through, they REMOVE it
 *     (the panel UI offers a "use default" / clear button for this).
 *
 * @param caso - the case record being rendered.
 * @param defaults - the admin-managed defaults (from
 *   `useFocusDefaults`). May be the empty object — that's the
 *   fresh-install state, fall through to per-case / hardcoded.
 */
export function resolveFocus(
  caso: Pick<CaseRecord, "section" | "category" | "focus">,
  defaults: FocusDefaults,
): FocusValue | undefined {
  // 1. Per-case override always wins. Bypass every default layer.
  if (caso.focus) return caso.focus;

  // 2. Per-category default. Custom categories are runtime-defined;
  //    we don't validate the id here — an unknown key just returns
  //    undefined and we keep walking.
  const byCategory = defaults.categories?.[caso.category];
  if (byCategory) return byCategory;

  // 3. Per-section default.
  const bySection = defaults.sections?.[caso.section];
  if (bySection) return bySection;

  // 4. Built-in section preset. Sits between admin section defaults
  //    and the global layer so a section the import pipeline knows
  //    needs a non-50/50 baseline (ECG today) gets one without an
  //    admin having to configure every install. See SECTION_PRESETS
  //    above for the per-section rationale.
  const preset = SECTION_PRESETS[caso.section];
  if (preset) return preset;

  // 5. Global default.
  if (defaults.global) return defaults.global;

  // 6. No hit — let the renderer apply its hard-coded defaults.
  return undefined;
}

/**
 * Predicate for the panel UI: is this `FocusValue` equivalent to
 * the renderer's hardcoded default? Used to decide whether to show
 * the "(default)" badge next to a row, and to decide whether saving
 * a slot should write `{}` (explicit reset) or omit the key entirely.
 *
 * Treats missing properties as the default value (50/50/1).
 */
export function isDefaultFocus(focus: FocusValue | undefined): boolean {
  if (!focus) return true;
  const x = focus.x ?? 50;
  const y = focus.y ?? 50;
  const scale = focus.scale ?? 1;
  return x === 50 && y === 50 && scale === 1;
}
