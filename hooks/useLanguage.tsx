"use client";

// `useLanguage` — global UI language (es/en) with URL + localStorage
// persistence and cross-tab sync. The pre-paint script in
// `app/layout.tsx` already set `<html lang>` to the resolved value
// before hydration; this provider takes ownership of the same state
// once React boots so React-side reads stay reactive.
//
// Source-of-truth order (highest first):
//   1. URL query `?lang=es|en` — explicit, shareable
//   2. localStorage `pocus_lang` — sticky across visits
//   3. `navigator.language` heuristic — sensible first-time default
//   4. `DEFAULT_LANG` constant — last resort
//
// Mutations write to BOTH localStorage and URL (`history.replaceState`,
// no nav, no RSC fetch — same trick as `useViewState` for filter
// changes). The provider also publishes on the cross-tab channel so
// other tabs of the app pick up the change without a refresh.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LANG,
  DICTS,
  detectBrowserLang,
  formatDate,
  formatDateTime,
  interpolate,
  isLang,
  type DictKey,
  type Lang,
} from "@/lib/i18n";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { useCrossTabSync } from "./useCrossTabSync";

interface LanguageContextValue {
  /** Currently active UI language. */
  lang: Lang;
  /** Set the language. Persists to URL + localStorage and updates
   *  `<html lang>`. Cross-tab sync is automatic. */
  setLang: (next: Lang) => void;
  /** Translate a key, with optional `{name}` placeholder vars. */
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
  /** Locale-aware short date (`8 may 2026` vs `May 8, 2026`). */
  formatDate: (input: string | Date | undefined) => string;
  /** Locale-aware date+time (admin Papelera columns). */
  formatDateTime: (input: string | Date | undefined) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Resolve the initial language during the first client render. This
 * runs only once per mount; we want the same answer the pre-paint
 * script in `app/layout` produced so the React tree agrees with
 * `<html lang>`. Reading the URL/localStorage here re-derives that
 * value rather than reading `document.documentElement.lang`
 * directly — keeps the resolution policy in one place.
 *
 * SSR returns `DEFAULT_LANG` because `window` doesn't exist; the
 * post-mount effect re-reads and corrects.
 */
function resolveInitialLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const urlParam = new URLSearchParams(window.location.search).get("lang");
    if (isLang(urlParam)) return urlParam;
    const stored = window.localStorage.getItem(STORAGE_KEYS.lang);
    if (isLang(stored)) return stored;
    return detectBrowserLang(window.navigator.language);
  } catch {
    return DEFAULT_LANG;
  }
}

/**
 * Update the URL's `?lang=` parameter without a navigation. Mirrors
 * the trick `useViewState` uses for filter changes: no RSC refetch,
 * no scroll jump, just a quiet History API replace.
 *
 * `lang === DEFAULT_LANG` removes the param entirely so the canonical
 * URL stays clean (`/atlas` instead of `/atlas?lang=es`).
 */
function writeLangToUrl(lang: Lang): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (lang === DEFAULT_LANG) {
    url.searchParams.delete("lang");
  } else {
    url.searchParams.set("lang", lang);
  }
  // `searchParams.toString()` is idempotent: the result is always the
  // canonical form (deduped, sorted by browser convention). Comparing
  // to the existing search prevents pointless history writes.
  const next = `${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ""}${url.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, "", next);
  }
}

interface ProviderProps {
  children: ReactNode;
  /** Test seam — pinned to a specific language for unit tests so
   *  the resolver doesn't depend on `window.location` / storage. */
  initialLang?: Lang;
}

export function LanguageProvider({ children, initialLang }: ProviderProps) {
  // Initial value is sync-resolved so the first render already shows
  // the right language (no flash). The post-mount effect re-validates
  // in case the resolver disagreed with the pre-paint script.
  const [lang, setLangState] = useState<Lang>(() => initialLang ?? resolveInitialLang());

  // Cross-tab listener: when another tab changes the language, mirror
  // it locally. The publisher returned here is invoked after every
  // local mutation below.
  const publish = useCrossTabSync("language", () => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEYS.lang);
      if (isLang(stored) && stored !== lang) setLangState(stored);
    } catch {
      // localStorage might be unavailable (memory shim doesn't talk
      // back through the channel; that's fine — same-tab is enough).
    }
  });

  // Reflect every state change into `<html lang>` for assistive tech
  // and for any CSS that keys off `:lang(en)`. Idempotent: setting
  // the attribute to its current value is a no-op.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.documentElement.lang !== lang) {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  // After mount, re-derive in case the pre-paint script and the
  // synchronous resolver above disagreed (different env, different
  // navigator). The effect runs once per mount.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;
    if (initialLang) return; // Test override wins.
    const resolved = resolveInitialLang();
    if (resolved !== lang) setLangState(resolved);
    // We deliberately do NOT include `lang` in deps — the goal is
    // a one-shot reconcile, not a perpetual sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = useCallback(
    (next: Lang) => {
      if (next === lang) return;
      setLangState(next);
      try {
        window.localStorage.setItem(STORAGE_KEYS.lang, next);
      } catch {
        // memory-shim path — change still lives in React state
        // and cross-tab sync becomes a no-op for this tab.
      }
      writeLangToUrl(next);
      publish();
    },
    [lang, publish],
  );

  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>): string => {
      return interpolate(DICTS[lang][key], vars);
    },
    [lang],
  );

  const formatDateLocal = useCallback(
    (input: string | Date | undefined) => formatDate(input, lang),
    [lang],
  );
  const formatDateTimeLocal = useCallback(
    (input: string | Date | undefined) => formatDateTime(input, lang),
    [lang],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      t,
      formatDate: formatDateLocal,
      formatDateTime: formatDateTimeLocal,
    }),
    [lang, setLang, t, formatDateLocal, formatDateTimeLocal],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * Subscribe to the active language. Throws (in dev) if used outside
 * a `<LanguageProvider>` so missing wrappers fail loud rather than
 * silently rendering Spanish.
 */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside a <LanguageProvider>");
  }
  return ctx;
}

/**
 * Sugar: pull only the translator. Shorter than `useLanguage().t`
 * at the callsite — most chrome components only need this.
 */
export function useT(): LanguageContextValue["t"] {
  return useLanguage().t;
}
