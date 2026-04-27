"use client";

// Mobile-only navigation drawer. The desktop header collapses on small
// screens (audit §8 noted this had no replacement). The hamburger
// button in the header toggles this drawer.

import Link from "next/link";
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
            <span className="brand-mark"></span>
            Taote POCUS
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
              <Link
                key={s.id}
                href={viewToPath(target)}
                className={isActive(target) ? "active" : ""}
                onClick={onClose}
                aria-current={isActive(target) ? "page" : undefined}
              >
                {s.label}
              </Link>
            );
          })}
          <Link
            href={viewToPath({ kind: "favs" })}
            className={view.kind === "favs" ? "active" : ""}
            onClick={onClose}
          >
            Favoritos {favCount > 0 && <span className="fav-count">{favCount}</span>}
          </Link>
          {isAdmin && (
            <Link
              href={viewToPath({ kind: "admin" })}
              className={view.kind === "admin" ? "active" : ""}
              onClick={onClose}
            >
              Administrar
            </Link>
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
              className="btn-primary"
              onClick={() => {
                onClose();
                onLogin();
              }}
            >
              <Icon.user /> Entrar
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
