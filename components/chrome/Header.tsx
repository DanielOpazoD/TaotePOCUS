"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
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

  return (
    <header className="app-header">
      <div className="header-inner">
        <button type="button" className="hamburger" onClick={onOpenDrawer} aria-label="Abrir menú">
          {Icon.menu()}
        </button>
        <Link className="brand" href="/" aria-label="Taote POCUS — inicio">
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
        </Link>
        <nav className="nav" aria-label="Secciones">
          {SECTIONS.map((s) => {
            const target: View = { kind: "section", section: s.id };
            return (
              <Link
                key={s.id}
                href={viewToPath(target)}
                className={isActive(target) ? "active" : ""}
                aria-current={isActive(target) ? "page" : undefined}
              >
                {s.label}
              </Link>
            );
          })}
          <Link
            href={viewToPath({ kind: "favs" })}
            className={view.kind === "favs" ? "active" : ""}
            aria-current={view.kind === "favs" ? "page" : undefined}
          >
            Favoritos {favCount > 0 && <span className="fav-count">{favCount}</span>}
          </Link>
          {isAdmin && (
            <Link
              href={viewToPath({ kind: "admin" })}
              className={view.kind === "admin" ? "active" : ""}
              aria-current={view.kind === "admin" ? "page" : undefined}
            >
              Administrar
            </Link>
          )}
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
