// Core i18n primitives — no React, no DOM. Imported by the dictionary
// files, the React provider, and the pre-paint script in `app/layout`.
// Keeping these in a leaf module lets the layout's inline script
// reference the same union without dragging the whole React tree.
//
// Two languages today (es/en); the type union is the authoritative
// list. Adding a third (e.g. pt) means: extend `Lang`, add `LANGS`
// entry, ship `dict.pt.ts`, and the typecheck flags every consumer
// that needs to handle the new branch.

/** Supported UI language. Fixed at the type level so missing branches
 *  in switch statements are compile errors. */
export type Lang = "es" | "en";

/** Runtime list of supported languages. Use this when you need to
 *  iterate (e.g. the language switcher's option list) so adding a
 *  new language stays a one-line change. */
export const LANGS = ["es", "en"] as const satisfies readonly Lang[];

/** Default language when nothing else (URL, storage, browser hint)
 *  resolves to a supported value. Spanish is the editorial baseline
 *  for the catalog — that's what the canonical strings ship in. */
export const DEFAULT_LANG: Lang = "es";

/** Type guard. Use to validate any externally-provided value (URL
 *  param, localStorage read, postMessage payload) before persisting
 *  it. Centralizing the predicate so a new language is one edit. */
export function isLang(value: unknown): value is Lang {
  return value === "es" || value === "en";
}

/**
 * Pick a sensible default from a `navigator.language`-shaped string.
 * Browser values look like `"es"`, `"es-CL"`, `"en-US"`, occasionally
 * `"en_US"` from older shells. We only care about the primary subtag.
 *
 * Falls back to `DEFAULT_LANG` for anything we don't speak. The caller
 * decides priority order — typically `?lang=` query param > stored
 * pref > this detector > `DEFAULT_LANG`.
 */
export function detectBrowserLang(navigatorLang: string | null | undefined): Lang {
  if (!navigatorLang) return DEFAULT_LANG;
  const primary = navigatorLang.toLowerCase().split(/[-_]/)[0];
  if (primary === "es") return "es";
  if (primary === "en") return "en";
  return DEFAULT_LANG;
}

/** BCP-47 locale used by `Intl` APIs. ES is biased to Chilean Spanish
 *  because the editorial line is local; EN is the neutral US locale.
 *  Centralized so every `toLocaleString` / `Intl.DateTimeFormat` call
 *  agrees on the same locale per language. */
export function localeOf(lang: Lang): string {
  return lang === "es" ? "es-CL" : "en-US";
}
