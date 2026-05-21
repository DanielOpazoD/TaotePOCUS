"use client";

import { useEffect, useRef } from "react";
import TransitionLink from "./TransitionLink";
import { Icon } from "@/lib/icons";
import { SECTIONS } from "@/lib/data";
import { sectionLabel } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import { viewToPath } from "@/lib/url";
import type { Section, User, View } from "@/lib/types";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitcher from "./LanguageSwitcher";
import UserMenu from "./UserMenu";

/**
 * Returns true when the user is currently typing in a field. We use it
 * to ignore the global "/" shortcut while focus is in an input — pressing
 * "/" in the address bar of a form should type the slash, not steal
 * focus to the search box.
 */
function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

interface Props {
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  query: string;
  setQuery: (q: string) => void;
  view: View;
  favCount: number;
  onNewCase: () => void;
  onOpenDrawer: () => void;
  /**
   * Sections to render in the top nav. Defaults to the full `SECTIONS`
   * catalog when omitted — App.tsx forwards the visibility-filtered
   * list (`useHiddenSections().visibleSections`) so admin-hidden
   * sections drop from the rail. Omitting the prop keeps older
   * callers / focused tests rendering the catalog as-is.
   */
  sections?: Section[];
}

export default function Header({
  user,
  onLogin,
  onLogout,
  query,
  setQuery,
  view,
  favCount,
  onNewCase,
  onOpenDrawer,
  sections = SECTIONS,
}: Props) {
  const { lang, t } = useLanguage();
  const isAdmin = user?.role === "admin";
  const isActive = (target: View) => {
    if (target.kind !== view.kind) return false;
    if (target.kind === "section" && view.kind === "section")
      return target.section === view.section;
    return true;
  };

  // Global "/" shortcut focuses the search box — same idiom as GitHub
  // and Linear. Ignored when the user is already typing in a field.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingInField(e.target)) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Scrolled-state class. At the top of the page the header is opaque
  // and borderless (just a subtle hairline). After 8px of scroll it
  // becomes frosted glass with a stronger blur and a faint shadow,
  // so the section underneath shows through. Pure CSS effect with a
  // single boolean class flip — listener is passive, no jank.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => {
      const scrolled = window.scrollY > 8;
      el.classList.toggle("is-scrolled", scrolled);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  // The nav used to render a magnetic floating underline that slid
  // between links on hover with a spring easing. It was a craft
  // moment — but at every page load the bar swept across the
  // viewport, and the spring on hover read as fussy for what is
  // structurally just route navigation. Replaced (May-2026) with a
  // static underline under the active link via CSS (`.nav a.active`)
  // and a color shift on hover. The `view-transition-name` on the
  // active link still morphs cleanly between routes.

  return (
    <header className="app-header" ref={headerRef}>
      <div className="header-inner">
        <button
          type="button"
          className="hamburger"
          onClick={onOpenDrawer}
          aria-label={t("nav.menu.open")}
        >
          {Icon.menu()}
        </button>
        {/* Brand link. The earlier `.brand-tag` chip mirroring the
            active language ("ES"/"EN") next to the wordmark was
            removed in this pass — the interactive `LanguageSwitcher`
            on the right already surfaces the same code with its own
            label, and two static "ES" pills 30px apart read as a
            broken duplicate to first-time visitors. */}
        <TransitionLink className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
              {/* Outer ring: ultrasound field. `pathLength={100}`
                  normalizes both shapes to 100 units so the same
                  stroke-dasharray drives the trace animation in CSS. */}
              <circle
                cx="14"
                cy="14"
                r="12.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                opacity="0.35"
                pathLength={100}
              />
              {/* Sine wave: the sound wave through the field. */}
              <path
                d="M3 14 Q 7 7, 11 14 T 19 14 T 25 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                pathLength={100}
              />
            </svg>
          </span>
          <span className="brand-wordmark">
            Taote <em>POCUS</em>
          </span>
        </TransitionLink>
        <nav className="nav" aria-label={t("nav.aria.sections")}>
          {sections.map((s) => {
            const target: View = { kind: "section", section: s.id };
            return (
              <TransitionLink
                key={s.id}
                href={viewToPath(target)}
                className={isActive(target) ? "active" : ""}
                aria-current={isActive(target) ? "page" : undefined}
              >
                {sectionLabel(s.id, lang)}
              </TransitionLink>
            );
          })}
          <TransitionLink
            href={viewToPath({ kind: "favs" })}
            className={view.kind === "favs" ? "active" : ""}
            aria-current={view.kind === "favs" ? "page" : undefined}
          >
            {t("nav.favoritos")} {favCount > 0 && <span className="fav-count">{favCount}</span>}
          </TransitionLink>
          {/* The "Administrar" gear icon used to live here as the last
              nav entry (admin-only). It moved into `UserMenu` because
              section navigation is for everyone and an admin-only
              affordance read as out of place. Pre-warming of the
              lazy AdminPanel chunk follows the link — see
              `components/admin/preload.ts`. */}
        </nav>
        <div className="header-search" role="search">
          <Icon.search />
          <input
            ref={searchRef}
            type="search"
            placeholder={t("search.placeholder")}
            aria-label={t("search.aria")}
            aria-keyshortcuts="/"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="header-search-kbd" aria-hidden="true">
            /
          </kbd>
        </div>
        <div className="header-right">
          <LanguageSwitcher />
          <ThemeToggle />
          {isAdmin && (
            <button
              className="btn-primary btn-icon-only"
              onClick={onNewCase}
              aria-label={t("newCase.aria")}
              title={t("newCase.label")}
            >
              <Icon.plus />
            </button>
          )}
          {/* `UserMenu` rolls up three header surfaces that used to
              be siblings: the role pill the admin already knew (no
              new information), the standalone logout button (visual
              weight), and the avatar (decorative). They share one
              dropdown anchored to the avatar. The gear link that
              used to live in the section nav moves into the same
              menu — admin-only actions cluster behind the avatar
              where account-scoped affordances belong.

              The avatar is the affordance: tap initials → menu. */}
          {user ? (
            <UserMenu user={user} view={view} onLogout={onLogout} />
          ) : (
            <button
              className="btn-primary btn-icon-only"
              onClick={onLogin}
              aria-label={t("nav.entrar")}
              title={t("nav.entrar")}
            >
              <Icon.user />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
