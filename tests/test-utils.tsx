// Shared test helpers. Right now this is just `renderWithLanguage`,
// the wrapper that mounts `<LanguageProvider>` around the component
// under test so any `useLanguage`-using descendant doesn't blow up
// on the missing-Provider guard.
//
// Tests that previously called `render(<Comp …/>)` should switch to
// `renderWithLanguage(<Comp …/>)`. The default language is Spanish
// because all existing assertions match the Spanish copy; pin a
// different language for an EN-specific test by passing `lang: "en"`.

import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { LanguageProvider } from "@/hooks/useLanguage";
import { type Lang } from "@/lib/i18n";

interface ExtraOptions {
  /** Pin the active language. Defaults to `"es"` so existing assertions
   *  against Spanish copy keep passing without modification. */
  lang?: Lang;
}

/**
 * Render a component inside a `<LanguageProvider>` with a fixed
 * language. The provider's `initialLang` prop bypasses the URL /
 * storage / navigator resolver so the test environment doesn't
 * leak across describe blocks.
 *
 * Uses RTL's `wrapper` option so `result.rerender(<NewUI/>)` keeps
 * the same provider mounted across re-renders — passing the
 * provider inline as `<LanguageProvider>{ui}</LanguageProvider>`
 * would tear it down on every rerender call.
 */
export function renderWithLanguage(
  ui: ReactElement,
  options: RenderOptions & ExtraOptions = {},
): RenderResult {
  const { lang = "es", ...rest } = options;
  function Wrapper({ children }: { children: ReactNode }) {
    return <LanguageProvider initialLang={lang}>{children}</LanguageProvider>;
  }
  return render(ui, { wrapper: Wrapper, ...rest });
}
