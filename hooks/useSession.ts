"use client";

import { useCallback, useEffect, useState } from "react";
import { repo } from "@/lib/repo";
import { isAuthError } from "@/lib/errors";
import { IS_ADMIN_BYPASS_ENABLED, ADMIN_CREDENTIALS } from "@/lib/env";
import type { AuthErrorCode } from "@/lib/errors";
import type { User } from "@/lib/types";

/**
 * Build a synthetic admin user object for the dev-time bypass. The
 * shape matches `repo.auth.login`'s output so consumers don't need
 * to know whether a session was earned or pre-mounted.
 */
function bypassAdmin(): User {
  const issuedAt = Date.now();
  return {
    email: ADMIN_CREDENTIALS.email,
    name: "Administrador (bypass)",
    initials: "AD",
    role: "admin",
    issuedAt,
    // 30-day window — long enough for a dev session to never expire
    // mid-edit. The bypass is dev-only anyway.
    expiresAt: issuedAt + 30 * 24 * 3_600_000,
  };
}

export type LoginInput = {
  email: string;
  password: string;
  name?: string;
};

export type LoginResult =
  | { ok: true }
  | { ok: false; code: AuthErrorCode | "unknown"; message: string };

interface Options {
  /** Called with a translated user-facing message when something happens. */
  notify?: (message: string) => void;
}

/**
 * Owns the authentication session: hydration on mount, focus-based
 * re-validation, login + logout. The repo-side logic stays in `lib/repo.ts`;
 * this hook is the React adapter.
 *
 * Hydration: on mount, reads the persisted session (if any). `hydrated`
 * flips true once the initial read resolves so consumers can defer
 * any UI that depends on the session.
 *
 * Re-validation: when the tab regains focus we re-read the session.
 * If it expired in the background, the user is logged out cleanly with
 * a toast instead of being allowed to perform actions on a dead token.
 *
 * @param options - Optional `notify` channel for toast-shaped status
 *   updates (login welcome, expiry, errors).
 * @returns The session shape:
 *   - `user`: the current user, or `null` when anonymous / not yet hydrated.
 *   - `isAdmin`: convenience derived from `user.role`.
 *   - `hydrated`: false during the initial repo read; true after.
 *   - `login(input)`: promise-resolving to `{ok: true}` or a typed failure.
 *   - `logout()`: clears the session and notifies.
 *
 * @example
 *   const { user, isAdmin, hydrated, login, logout } = useSession({ notify });
 *   if (!hydrated) return <Skeleton />;
 */
export function useSession({ notify }: Options = {}) {
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Dev-time admin bypass: skip the repo round-trip entirely and
    // mount a synthetic admin session. The bypass flag is hard-disabled
    // in production builds so a leaked .env can't open admin to the
    // public. See lib/env.ts > IS_ADMIN_BYPASS_ENABLED.
    if (IS_ADMIN_BYPASS_ENABLED) {
      setUser(bypassAdmin());
      setHydrated(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const u = await repo.auth.current();
      if (cancelled) return;
      setUser(u);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const onFocus = async () => {
      const fresh = await repo.auth.current();
      if (!fresh && user) {
        setUser(null);
        notify?.("Tu sesión expiró");
      } else if (fresh && fresh.email !== user?.email) {
        setUser(fresh);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [hydrated, user, notify]);

  const login = useCallback(
    async (input: LoginInput): Promise<LoginResult> => {
      try {
        const u = await repo.auth.login(input.email, input.password, input.name);
        setUser(u);
        notify?.(`Hola, ${u.name.split(" ")[0]} 👋`);
        return { ok: true };
      } catch (e) {
        if (isAuthError(e)) {
          return { ok: false, code: e.code, message: e.userMessage };
        }
        return { ok: false, code: "unknown", message: "No se pudo iniciar sesión." };
      }
    },
    [notify],
  );

  const logout = useCallback(async () => {
    await repo.auth.logout();
    setUser(null);
    notify?.("Sesión cerrada");
  }, [notify]);

  return {
    user,
    isAdmin: user?.role === "admin",
    hydrated,
    login,
    logout,
  };
}
