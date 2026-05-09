"use client";

// Mobile-only navigation drawer. On viewports < 960px the desktop
// chrome (top nav, full search, persistent sidebar) is hidden; the
// hamburger button in the header toggles this drawer instead. The
// drawer carries:
//
//   - Section nav (mirrors the desktop top nav)
//   - Category filter list (mirrors the desktop sidebar — was
//     missing until May-2026, leaving mobile users without
//     category navigation)
//   - User actions (login / logout / new case)
//
// Keep the drawer self-contained: it's a peer of `<Sidebar>` for
// mobile and the props are deliberately a superset so the parent
// (App.tsx) can pass the same handlers to both.

import TransitionLink from "./TransitionLink";
import { useEffect } from "react";
import { CategoryGlyph, CustomCategoryGlyph, Icon } from "@/lib/icons";
import { SECTIONS } from "@/lib/data";
import { categoryLabel, sectionLabel } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import { viewToPath } from "@/lib/url";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { CategoryWithCount, Section, User, View } from "@/lib/types";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitcher from "./LanguageSwitcher";

interface Props {
  open: boolean;
  onClose: () => void;
  view: View;
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  favCount: number;
  onNewCase: () => void;
  /**
   * Sections to render in the drawer nav. See Header.tsx for the
   * visibility-filter rationale; both surfaces share one source list.
   */
  sections?: Section[];
  /**
   * Categories visible in the current section, with counts. Mirrors
   * the desktop sidebar's prop. Optional so older callers / tests
   * still mount a basic drawer.
   */
  categories?: CategoryWithCount[];
  /** Currently active category id, or null for "Todos". */
  activeCat?: string | null;
  /** Set the active category. The drawer auto-closes after a
   *  selection so the user sees the filtered grid immediately. */
  setActiveCat?: (id: string | null) => void;
  /** Total cases in the current section (for the "Todos" row). */
  totalCount?: number;
}

export default function MobileDrawer({
  open,
  onClose,
  view,
  user,
  onLogin,
  onLogout,
  favCount,
  onNewCase,
  sections = SECTIONS,
  categories,
  activeCat = null,
  setActiveCat,
  totalCount = 0,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const { lang, t } = useLanguage();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const isActive = (target: View) => {
    if (target.kind !== view.kind) return false;
    if (target.kind === "section" && view.kind === "section")
      return target.section === view.section;
    return true;
  };

  return (
    <div
      className="drawer-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("nav.menu.aria")}
    >
      <div className="drawer" onClick={(e) => e.stopPropagation()} ref={trapRef}>
        <div className="drawer-head">
          <div className="brand" style={{ fontSize: 18 }}>
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <circle
                  cx="14"
                  cy="14"
                  r="12.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  opacity="0.35"
                />
                <path
                  d="M3 14 Q 7 7, 11 14 T 19 14 T 25 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="brand-wordmark">
              Taote <em>POCUS</em>
            </span>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label={t("nav.menu.close")}
            style={{ position: "static", boxShadow: "none" }}
          >
            {Icon.close()}
          </button>
        </div>

        <nav className="drawer-nav" aria-label={t("nav.aria.sections")}>
          {sections.map((s) => {
            const target: View = { kind: "section", section: s.id };
            return (
              <TransitionLink
                key={s.id}
                href={viewToPath(target)}
                className={isActive(target) ? "active" : ""}
                onClick={onClose}
                aria-current={isActive(target) ? "page" : undefined}
              >
                {sectionLabel(s.id, lang)}
              </TransitionLink>
            );
          })}
          <TransitionLink
            href={viewToPath({ kind: "favs" })}
            className={view.kind === "favs" ? "active" : ""}
            onClick={onClose}
          >
            {t("nav.favoritos")} {favCount > 0 && <span className="fav-count">{favCount}</span>}
          </TransitionLink>
          {isAdmin && (
            <TransitionLink
              href={viewToPath({ kind: "admin" })}
              className={view.kind === "admin" ? "active" : ""}
              onClick={onClose}
            >
              {t("nav.administrar")}
            </TransitionLink>
          )}
        </nav>

        {/* Category filters — only when the current view shows a
            section grid. Outside section views (favoritos, admin)
            categories don't apply, so we hide the section. The
            "Todos" row matches the desktop sidebar's first item. */}
        {setActiveCat && categories && view.kind === "section" && (
          <div className="drawer-filters" aria-label={t("drawer.filters.aria")}>
            <h4>{t("drawer.categories")}</h4>
            <ul className="drawer-cat-list">
              <li>
                <button
                  type="button"
                  className={!activeCat ? "active" : ""}
                  onClick={() => {
                    setActiveCat(null);
                    onClose();
                  }}
                >
                  <span className="drawer-cat-label">
                    <span className="drawer-cat-glyph" aria-hidden="true">
                      {Icon.search()}
                    </span>
                    {t("drawer.todos")}
                  </span>
                  <span className="drawer-cat-count">{totalCount}</span>
                </button>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={activeCat === c.id ? "active" : ""}
                    onClick={() => {
                      setActiveCat(c.id);
                      onClose();
                    }}
                  >
                    <span className="drawer-cat-label">
                      <span className="drawer-cat-glyph" aria-hidden="true">
                        {CategoryGlyph[c.id] ?? CustomCategoryGlyph}
                      </span>
                      {categoryLabel(c, lang)}
                    </span>
                    <span className="drawer-cat-count">{c.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="drawer-actions">
          {isAdmin && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onClose();
                onNewCase();
              }}
            >
              <Icon.plus /> {t("newCase.label")}
            </button>
          )}
          {user ? (
            <div className="drawer-user">
              <div className="modal-avatar" style={{ width: 36, height: 36, fontSize: 13 }}>
                {user.initials}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>{user.name}</span>
                <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>{user.email}</span>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                style={{ marginLeft: "auto" }}
              >
                {t("nav.salir")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-primary btn-icon-only"
              onClick={() => {
                onClose();
                onLogin();
              }}
              aria-label={t("nav.entrar")}
              title={t("nav.entrar")}
            >
              <Icon.user />
            </button>
          )}
          <div className="drawer-theme">
            {/* Two icon controls stacked horizontally: language and
                theme. Mobile users get the same surface area as the
                header right-cluster on desktop. */}
            <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("theme.label")}</span>
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}
