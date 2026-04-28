"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import TransitionLink from "./TransitionLink";
import { Icon } from "@/lib/icons";
import { SECTIONS } from "@/lib/data";
import { viewToPath } from "@/lib/url";
import type { User, View } from "@/lib/types";
import ThemeToggle from "./ThemeToggle";

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
}: Props) {
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

  // Magnetic nav underline. A single floating indicator sits below
  // the nav links and slides between them with spring easing. By
  // default it's anchored under the active link; on hover it follows
  // the cursor's nearest link. On leave it springs back. The
  // `view-transition-name` already wired into CSS keeps the indicator
  // consistent across route changes.
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number; visible: boolean }>({
    x: 0,
    w: 0,
    visible: false,
  });

  const recomputeFromActive = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLAnchorElement>("a.active");
    if (!active) {
      setIndicator((prev) => ({ ...prev, visible: false }));
      return;
    }
    const navBox = nav.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    // Match the previous ::after underline padding (left/right 14px)
    // so the new indicator lines up with where the underline used to be.
    setIndicator({ x: box.left - navBox.left + 14, w: box.width - 28, visible: true });
  }, []);

  // Layout-effect so the indicator paints in its correct spot on the
  // first frame — no fade-in flicker on initial render or route swap.
  useLayoutEffect(() => {
    recomputeFromActive();
  }, [view, favCount, isAdmin, recomputeFromActive]);

  // Recompute on viewport resize — link bboxes change when the nav
  // wraps or the search field stretches.
  useEffect(() => {
    const onResize = () => recomputeFromActive();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [recomputeFromActive]);

  const onNavMove = (e: React.PointerEvent<HTMLElement>) => {
    const link = (e.target as HTMLElement | null)?.closest?.("a");
    const nav = navRef.current;
    if (!link || !nav || !nav.contains(link)) return;
    const navBox = nav.getBoundingClientRect();
    const box = (link as HTMLAnchorElement).getBoundingClientRect();
    setIndicator({ x: box.left - navBox.left + 14, w: box.width - 28, visible: true });
  };
  const onNavLeave = () => recomputeFromActive();

  return (
    <header className="app-header" ref={headerRef}>
      <div className="header-inner">
        <button type="button" className="hamburger" onClick={onOpenDrawer} aria-label="Abrir menú">
          {Icon.menu()}
        </button>
        <TransitionLink className="brand" href="/" aria-label="Taote POCUS — inicio">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
              {/* Outer ring: ultrasound field. */}
              <circle
                cx="14"
                cy="14"
                r="12.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                opacity="0.35"
              />
              {/* Sine wave: the sound wave through the field. */}
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
          <span className="brand-tag">ES</span>
        </TransitionLink>
        <nav
          className="nav"
          aria-label="Secciones"
          ref={navRef}
          onPointerMove={onNavMove}
          onPointerLeave={onNavLeave}
        >
          {SECTIONS.map((s) => {
            const target: View = { kind: "section", section: s.id };
            return (
              <TransitionLink
                key={s.id}
                href={viewToPath(target)}
                className={isActive(target) ? "active" : ""}
                aria-current={isActive(target) ? "page" : undefined}
              >
                {s.label}
              </TransitionLink>
            );
          })}
          <TransitionLink
            href={viewToPath({ kind: "favs" })}
            className={view.kind === "favs" ? "active" : ""}
            aria-current={view.kind === "favs" ? "page" : undefined}
          >
            Favoritos {favCount > 0 && <span className="fav-count">{favCount}</span>}
          </TransitionLink>
          {isAdmin && (
            <TransitionLink
              href={viewToPath({ kind: "admin" })}
              className={view.kind === "admin" ? "active" : ""}
              aria-current={view.kind === "admin" ? "page" : undefined}
            >
              Administrar
            </TransitionLink>
          )}
          <span
            className={`nav-indicator${indicator.visible ? " is-visible" : ""}`}
            aria-hidden="true"
            style={
              {
                "--ind-x": `${indicator.x}px`,
                "--ind-w": `${indicator.w}px`,
              } as React.CSSProperties
            }
          />
        </nav>
        <div className="header-search" role="search">
          <Icon.search />
          <input
            ref={searchRef}
            type="search"
            placeholder="Buscar casos, hallazgos, etiquetas…"
            aria-label="Buscar casos, hallazgos y etiquetas"
            aria-keyshortcuts="/"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="header-search-kbd" aria-hidden="true">
            /
          </kbd>
        </div>
        <div className="header-right">
          <ThemeToggle />
          {isAdmin && (
            <button className="btn-primary" onClick={onNewCase}>
              <Icon.plus /> Nuevo caso
            </button>
          )}
          {user ? (
            <>
              {isAdmin && <span className="admin-badge">ADMIN</span>}
              <div className="modal-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                {user.initials}
              </div>
              <button className="btn-ghost" onClick={onLogout}>
                Salir
              </button>
            </>
          ) : (
            <button className="btn-primary" onClick={onLogin}>
              <Icon.user /> Entrar
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
