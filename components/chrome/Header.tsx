"use client";

import Link from "next/link";
import { Icon } from "@/lib/icons";
import { SECTIONS } from "@/lib/data";
import { viewToPath } from "@/lib/url";
import type { User, View } from "@/lib/types";
import ThemeToggle from "./ThemeToggle";

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
  return (
    <header className="app-header">
      <div className="header-inner">
        <button type="button" className="hamburger" onClick={onOpenDrawer} aria-label="Abrir menú">
          {Icon.menu()}
        </button>
        <Link className="brand" href="/">
          <span className="brand-mark"></span>
          Taote POCUS
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
        <div className="header-search">
          <Icon.search />
          <input
            type="text"
            placeholder="Buscar casos, hallazgos, etiquetas…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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
