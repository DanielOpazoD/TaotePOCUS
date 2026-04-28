"use client";

// Mobile-only navigation drawer. The desktop header collapses on small
// screens (audit §8 noted this had no replacement). The hamburger
// button in the header toggles this drawer.

import TransitionLink from "./TransitionLink";
import { useEffect } from "react";
import { Icon } from "@/lib/icons";
import { SECTIONS } from "@/lib/data";
import { viewToPath } from "@/lib/url";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { User, View } from "@/lib/types";
import ThemeToggle from "./ThemeToggle";

interface Props {
  open: boolean;
  onClose: () => void;
  view: View;
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  favCount: number;
  onNewCase: () => void;
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
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
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
      aria-label="Menú de navegación"
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
            aria-label="Cerrar menú"
            style={{ position: "static", boxShadow: "none" }}
          >
            {Icon.close()}
          </button>
        </div>

        <nav className="drawer-nav" aria-label="Secciones">
          {SECTIONS.map((s) => {
            const target: View = { kind: "section", section: s.id };
            return (
              <TransitionLink
                key={s.id}
                href={viewToPath(target)}
                className={isActive(target) ? "active" : ""}
                onClick={onClose}
                aria-current={isActive(target) ? "page" : undefined}
              >
                {s.label}
              </TransitionLink>
            );
          })}
          <TransitionLink
            href={viewToPath({ kind: "favs" })}
            className={view.kind === "favs" ? "active" : ""}
            onClick={onClose}
          >
            Favoritos {favCount > 0 && <span className="fav-count">{favCount}</span>}
          </TransitionLink>
          {isAdmin && (
            <TransitionLink
              href={viewToPath({ kind: "admin" })}
              className={view.kind === "admin" ? "active" : ""}
              onClick={onClose}
            >
              Administrar
            </TransitionLink>
          )}
        </nav>

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
              <Icon.plus /> Nuevo caso
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
                Salir
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
              aria-label="Entrar"
              title="Entrar"
            >
              <Icon.user />
            </button>
          )}
          <div className="drawer-theme">
            <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Tema</span>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}
