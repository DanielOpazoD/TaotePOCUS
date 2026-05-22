"use client";

// Language switcher — globe icon + ES/EN dropdown. Sits in the
// header's right cluster next to the theme toggle.
//
// Why a dropdown instead of a click-toggle:
//   - Two languages today, but the dictionary is wired so a third
//     is a one-line change. A dropdown reads "more options
//     available" without the user clicking and getting surprised.
//   - The visible labels ("Español", "English") communicate what's
//     on offer at a glance — the icon + abbreviation alone make
//     the user click to discover.
//
// Implementation: leans on `<DropdownMenu>` for the open/close
// state machine (outside-click, ESC, focus return, aria wiring).
// Pre-PR-#120 this file owned its own copy of that ~80-line
// boilerplate alongside `UserMenu.tsx`; the two have been
// consolidated behind the primitive.

import { useLanguage } from "@/hooks/useLanguage";
import { LANGS, type Lang } from "@/lib/i18n";
import { DropdownMenu } from "./DropdownMenu";

/**
 * Globe-shaped icon. 24×24 viewBox, 1.5 stroke, currentColor —
 * matches the rest of `lib/icons.tsx`. Inline here rather than
 * adding to the central `Icon` map because no other surface uses
 * it; if a second consumer appears, promote it.
 */
function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useLanguage();

  // The dropdown's `close` helper is exposed via the render prop;
  // wired here so selecting a language collapses the popover.
  const choose = (next: Lang, close: () => void) => {
    setLang(next);
    close();
  };

  return (
    <DropdownMenu variant="listbox" className="lang-switcher">
      {({ open, toggle, close, triggerRef, triggerProps, popoverProps }) => (
        <>
          <button
            ref={triggerRef}
            type="button"
            className="icon-btn lang-switcher-trigger"
            onClick={toggle}
            aria-label={t("lang.aria")}
            title={t("lang.title")}
            {...triggerProps}
          >
            <GlobeIcon />
            <span className="lang-switcher-label" aria-hidden="true">
              {lang.toUpperCase()}
            </span>
          </button>
          {open && (
            <ul className="lang-menu" role="listbox" aria-label={t("lang.title")} {...popoverProps}>
              {LANGS.map((l) => (
                <li key={l}>
                  <button
                    type="button"
                    className={`lang-menu-item${l === lang ? " is-active" : ""}`}
                    role="option"
                    aria-selected={l === lang}
                    onClick={() => choose(l, close)}
                  >
                    <span className="lang-menu-code" aria-hidden="true">
                      {l.toUpperCase()}
                    </span>
                    <span className="lang-menu-label">{t(l === "es" ? "lang.es" : "lang.en")}</span>
                    {l === lang && (
                      <svg
                        className="lang-menu-check"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </DropdownMenu>
  );
}
