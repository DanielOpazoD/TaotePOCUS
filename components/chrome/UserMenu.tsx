"use client";

// Avatar-trigger dropdown for the active user. Two menu items:
//
//   - "Administrar" — link to /admin (admin role only). Pre-warms
//     the lazy AdminPanel chunk on hover / focus, same pattern the
//     header's gear icon used before this refactor (see PR #116).
//   - "Salir" — calls the parent's logout handler.
//
// Why a dropdown instead of the previous standalone Salir button +
// gear-in-nav:
//   - The standalone "Salir" button used screen real estate that
//     adds noise. The icon-only gear cluttered the section nav with
//     an admin-only affordance that doesn't belong there.
//   - The avatar already exists, is already a recognisable "this is
//     you" affordance, and naturally hosts identity-related actions.
//
// Implementation: same dropdown pattern as `LanguageSwitcher` —
// vanilla `useState`, outside-click + ESC handlers, focus return on
// close. No portal, no headless-ui dependency.

import { useEffect, useId, useRef, useState } from "react";
import TransitionLink from "./TransitionLink";
import { preloadAdminPanel } from "../admin/preload";
import { Icon } from "@/lib/icons";
import { useLanguage } from "@/hooks/useLanguage";
import { viewToPath } from "@/lib/url";
import type { User, View } from "@/lib/types";

interface Props {
  user: User;
  view: View;
  onLogout: () => void;
}

export default function UserMenu({ user, view, onLogout }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const isAdmin = user.role === "admin";

  // Outside-click + ESC + focus return. Mirrors `LanguageSwitcher`'s
  // identical block (intentional: same UX vocabulary across every
  // header dropdown).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        // Return focus so keyboard navigation stays sticky.
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

  const handleLogout = () => {
    setOpen(false);
    onLogout();
  };

  return (
    <div className="user-menu" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("userMenu.trigger.aria", { name: user.name })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        {/* The avatar circle IS the affordance — initials inside,
            the button frame is invisible until hover/focus so the
            visual is "tap your initials". */}
        <span className="user-menu-avatar" aria-hidden="true">
          {user.initials}
        </span>
      </button>
      {open && (
        <ul
          id={menuId}
          className="user-menu-popover"
          role="menu"
          aria-label={t("userMenu.popover.aria")}
          // Stop propagation so a click on a menu item doesn't get
          // intercepted by the outside-click handler before the
          // selection effect runs (matches `lang-menu`).
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Identity header — name + email so the user can confirm
              which account is active before acting. Not a role
              `menuitem` (it's descriptive, not interactive). */}
          <li className="user-menu-identity" role="none">
            <div className="user-menu-name">{user.name}</div>
            <div className="user-menu-email">{user.email}</div>
          </li>
          <li role="none" className="user-menu-sep" aria-hidden="true" />
          {isAdmin && (
            <li role="none">
              <TransitionLink
                href={viewToPath({ kind: "admin" })}
                className={`user-menu-item${view.kind === "admin" ? " is-active" : ""}`}
                role="menuitem"
                aria-current={view.kind === "admin" ? "page" : undefined}
                // Close the menu on click. The TransitionLink's
                // default `onClick` triggers the View Transition;
                // we wrap to also close the dropdown.
                onClick={() => setOpen(false)}
                // Pre-warm the lazy AdminPanel chunk on intent.
                // Moved from the header's old gear icon (PR #116).
                onMouseEnter={preloadAdminPanel}
                onFocus={preloadAdminPanel}
              >
                <span className="user-menu-icon" aria-hidden="true">
                  {Icon.gear()}
                </span>
                <span>{t("nav.administrar")}</span>
              </TransitionLink>
            </li>
          )}
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="user-menu-item user-menu-item--logout"
              onClick={handleLogout}
            >
              <span className="user-menu-icon" aria-hidden="true">
                {Icon.logout()}
              </span>
              <span>{t("nav.salir")}</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
