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
// Implementation: vanilla `useState` + outside-click + ESC. No
// portal, no headless-ui — the menu is small and lives next to
// its trigger so absolute positioning is enough.

import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { LANGS, type Lang } from "@/lib/i18n";

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
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Stable id for the listbox/labelledby pair — useId guarantees
  // uniqueness even if multiple switchers ever mount on the same
  // page (unlikely, but free correctness).
  const menuId = useId();

  // Close on ESC, on outside click, and when scrolling away from
  // the trigger. The latter prevents a stale floating menu drifting
  // when the user scrolls the page with the menu still open.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        // Return focus to the trigger so keyboard nav stays sticky.
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (next: Lang) => {
    setLang(next);
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="lang-switcher" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn lang-switcher-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("lang.aria")}
        title={t("lang.title")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        <GlobeIcon />
        <span className="lang-switcher-label" aria-hidden="true">
          {lang.toUpperCase()}
        </span>
      </button>
      {open && (
        <ul
          id={menuId}
          className="lang-menu"
          role="listbox"
          aria-label={t("lang.title")}
          // Stop propagation so a click on a list item doesn't
          // re-trigger the outside-click handler before the
          // selection effect runs.
          onMouseDown={(e) => e.stopPropagation()}
        >
          {LANGS.map((l) => (
            <li key={l}>
              <button
                type="button"
                className={`lang-menu-item${l === lang ? " is-active" : ""}`}
                role="option"
                aria-selected={l === lang}
                onClick={() => choose(l)}
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
    </div>
  );
}
