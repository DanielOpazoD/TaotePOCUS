// Provider behavior: initial resolution priority, t() interpolation,
// setLang persistence (URL + localStorage + <html lang>), and the
// throw-when-unwrapped guard. Cross-tab BroadcastChannel behavior is
// covered in `useCrossTabSync.test.tsx`; here we only assert the
// language-specific publish/listen contract.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { LanguageProvider, useLanguage, useT } from "@/hooks/useLanguage";
import { STORAGE_KEYS } from "@/lib/storage-keys";

function wrap(initialLang?: "es" | "en") {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <LanguageProvider initialLang={initialLang}>{children}</LanguageProvider>;
  };
}

describe("useLanguage", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset URL between tests so URL-based resolution doesn't leak.
    window.history.replaceState(null, "", "/");
    document.documentElement.lang = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when used outside a Provider", () => {
    // RTL's renderHook surfaces the throw via its error boundary.
    // Wrap in a try/catch instead so the assertion is local.
    expect(() => renderHook(() => useLanguage())).toThrow(/LanguageProvider/);
  });

  it("uses the test seam `initialLang` when provided", () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: wrap("en") });
    expect(result.current.lang).toBe("en");
    expect(result.current.t("nav.favoritos")).toBe("Favorites");
  });

  it("`t` interpolates {variables}", () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: wrap("es") });
    expect(result.current.t("footer.cases", { count: 5 })).toBe("5 casos publicados");
  });

  it("`useT` exposes only the translator", () => {
    const { result } = renderHook(() => useT(), { wrapper: wrap("es") });
    expect(result.current("nav.salir")).toBe("Salir");
  });

  it("setLang flips the active language", () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: wrap("es") });
    expect(result.current.lang).toBe("es");
    act(() => result.current.setLang("en"));
    expect(result.current.lang).toBe("en");
    expect(result.current.t("nav.favoritos")).toBe("Favorites");
  });

  it("setLang persists to localStorage", () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: wrap("es") });
    act(() => result.current.setLang("en"));
    expect(localStorage.getItem(STORAGE_KEYS.lang)).toBe("en");
  });

  it("setLang('en') writes ?lang=en into the URL", () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: wrap("es") });
    act(() => result.current.setLang("en"));
    expect(window.location.search).toBe("?lang=en");
  });

  it("setLang(DEFAULT_LANG) removes the param so canonical URLs stay clean", () => {
    window.history.replaceState(null, "", "/?lang=en&cat=cardiac");
    const { result } = renderHook(() => useLanguage(), { wrapper: wrap("en") });
    act(() => result.current.setLang("es"));
    // ES is the default — `?lang=` drops, but other params survive.
    expect(window.location.search).toBe("?cat=cardiac");
  });

  it("setLang updates document.documentElement.lang", () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: wrap("es") });
    expect(document.documentElement.lang).toBe("es");
    act(() => result.current.setLang("en"));
    expect(document.documentElement.lang).toBe("en");
  });

  it("setLang is a no-op when the language is unchanged", () => {
    // The body of setLang short-circuits; localStorage never gets
    // touched and the URL stays clean.
    const { result } = renderHook(() => useLanguage(), { wrapper: wrap("es") });
    act(() => result.current.setLang("es"));
    expect(localStorage.getItem(STORAGE_KEYS.lang)).toBeNull();
  });

  it("formatDate / formatDateTime use the active language's locale", () => {
    const { result, rerender } = renderHook(() => useLanguage(), { wrapper: wrap("es") });
    const isoDate = "2026-05-08T12:00:00Z";
    const esOut = result.current.formatDate(isoDate);
    expect(esOut.toLowerCase()).toMatch(/may/);

    act(() => result.current.setLang("en"));
    rerender();
    const enOut = result.current.formatDate(isoDate);
    expect(enOut).toMatch(/May/);
  });

  it("renders translated text inside a real component tree", () => {
    function Greeting() {
      const { t } = useLanguage();
      return <p>{t("nav.salir")}</p>;
    }
    render(
      <LanguageProvider initialLang="en">
        <Greeting />
      </LanguageProvider>,
    );
    expect(screen.getByText("Sign out")).toBeTruthy();
  });
});
