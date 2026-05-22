"use client";

// Avatar-trigger dropdown for the active user. Three menu items
// today:
//
//   - "Administrar" — admin-only link to /admin (pre-warms the
//     lazy AdminPanel chunk on hover via `preloadAdminPanel`).
//   - "Configuración" — opens the SettingsPanel modal.
//   - "Salir" — calls the parent's logout handler.
//
// Implementation: leans on `<DropdownMenu>` for the open/close
// state machine. Pre-PR-#120 this file owned its own copy of the
// boilerplate alongside `LanguageSwitcher.tsx`; consolidated
// behind the primitive.

import TransitionLink from "./TransitionLink";
import { DropdownMenu } from "./DropdownMenu";
import { preloadAdminPanel } from "../admin/preload";
import { Icon } from "@/lib/icons";
import { useLanguage } from "@/hooks/useLanguage";
import { viewToPath } from "@/lib/url";
import type { User, View } from "@/lib/types";

interface Props {
  user: User;
  view: View;
  onLogout: () => void;
  /** Opens the SettingsPanel modal. The modal mount itself lives
   *  in `AppModals` (alongside the other dialogs); the menu only
   *  triggers it. */
  onOpenSettings: () => void;
}

export default function UserMenu({ user, view, onLogout, onOpenSettings }: Props) {
  const { t } = useLanguage();
  const isAdmin = user.role === "admin";

  return (
    <DropdownMenu variant="menu" className="user-menu">
      {({ open, toggle, close, triggerRef, triggerProps, popoverProps }) => (
        <>
          <button
            ref={triggerRef}
            type="button"
            className="user-menu-trigger"
            onClick={toggle}
            aria-label={t("userMenu.trigger.aria", { name: user.name })}
            {...triggerProps}
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
              className="user-menu-popover"
              role="menu"
              aria-label={t("userMenu.popover.aria")}
              {...popoverProps}
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
                    onClick={close}
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
              {/* Settings row sits between Administrar and Salir so the
                  order reads: identity → role-scoped routes → account
                  prefs → session exit. Available to every authenticated
                  user. */}
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="user-menu-item"
                  onClick={() => {
                    close();
                    onOpenSettings();
                  }}
                >
                  <span className="user-menu-icon" aria-hidden="true">
                    {Icon.gear()}
                  </span>
                  <span>{t("settings.menuItem")}</span>
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="user-menu-item user-menu-item--logout"
                  onClick={() => {
                    close();
                    onLogout();
                  }}
                >
                  <span className="user-menu-icon" aria-hidden="true">
                    {Icon.logout()}
                  </span>
                  <span>{t("nav.salir")}</span>
                </button>
              </li>
            </ul>
          )}
        </>
      )}
    </DropdownMenu>
  );
}
