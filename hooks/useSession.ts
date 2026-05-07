"use client";

import { useCallback, useEffect, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { repo } from "@/lib/repo";
import { isAuthError } from "@/lib/errors";
import { IS_ADMIN_BYPASS_ENABLED, ADMIN_CREDENTIALS, IS_CLERK_ENABLED } from "@/lib/env";
import { mapClerkUserToAppUser } from "@/lib/clerk-auth";
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
 * re-validation, login + logout.
 *
 * Two backends, picked at module load by `IS_CLERK_ENABLED`:
 *
 *   - Clerk (`useSessionClerk`) — reads from `useUser()`, signs out
 *     via Clerk's SDK. The legacy `login` callback becomes a no-op
 *     because `<SignIn />` (rendered inside `AuthModal`) handles its
 *     own form submission.
 *   - Legacy (`useSessionLegacy`) — the original repo.auth path,
 *     used in tests and in any deploy without Clerk env vars.
 *
 * The exported value is a single function so React's rules of hooks
 * see one hook function per call site. The branch happens once at
 * module load (the env var is build-time constant), not per render.
 *
 * Hydration: on mount, reads the persisted session (if any).
 * `hydrated` flips true once the initial read resolves so consumers
 * can defer any UI that depends on the session.
 *
 * @param options - Optional `notify` channel for toast-shaped status
 *   updates (login welcome, expiry, errors).
 * @returns The session shape:
 *   - `user`: the current user, or `null` when anonymous / not yet hydrated.
 *   - `isAdmin`: convenience derived from `user.role`.
 *   - `hydrated`: false during the initial read; true after.
 *   - `login(input)`: promise-resolving to `{ok: true}` or a typed failure.
 *     A no-op stub in the Clerk path — kept for contract compatibility.
 *   - `logout()`: clears the session and notifies.
 *
 * @example
 *   const { user, isAdmin, hydrated, login, logout } = useSession({ notify });
 *   if (!hydrated) return <Skeleton />;
 */

/**
 * Legacy localStorage-backed session implementation. Exported by
 * name for tests; consumers should always use the public `useSession`
 * (it picks the right implementation at module load).
 */
export function useSessionLegacy({ notify }: Options = {}) {
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

/**
 * Clerk-backed session implementation. Exported by name for tests;
 * consumers should always use the public `useSession`.
 */
export function useSessionClerk({ notify }: Options = {}) {
  // Dev bypass takes precedence over Clerk so an unconfigured local
  // dev session still gets admin access without a Clerk account.
  // `useUser` / `useClerk` are still called below (rules of hooks)
  // but their results are ignored on the bypass path.
  const { user: clerkUser, isLoaded } = useUser();
  const clerk = useClerk();

  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [welcomedFor, setWelcomedFor] = useState<string | null>(null);

  useEffect(() => {
    if (IS_ADMIN_BYPASS_ENABLED) {
      setUser(bypassAdmin());
      setHydrated(true);
      return;
    }
    if (!isLoaded) return;
    const mapped = mapClerkUserToAppUser(clerkUser);
    setUser(mapped);
    setHydrated(true);
    // Welcome toast on the transition from "no user" to "user". Tracks
    // the welcomed email so a Clerk session refresh (which re-fires
    // this effect with the same user) doesn't re-toast.
    if (mapped && welcomedFor !== mapped.email) {
      setWelcomedFor(mapped.email);
      notify?.(`Hola, ${mapped.name.split(" ")[0]} 👋`);
    } else if (!mapped && welcomedFor) {
      // External logout (e.g., another tab signed out) — clear the
      // tracker so a re-login fires the welcome again.
      setWelcomedFor(null);
    }
  }, [isLoaded, clerkUser, notify, welcomedFor]);

  // No-op `login` — kept so the existing AuthModal contract type-checks.
  // The Clerk branch of `AuthModal` renders `<SignIn />`, which owns
  // its own submit handler; this callback never fires in that path.
  const login = useCallback(async (_input: LoginInput): Promise<LoginResult> => {
    return {
      ok: false,
      code: "unknown",
      message: "Iniciá sesión usando el formulario de Clerk.",
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await clerk.signOut();
    } catch {
      // Network failures during signOut still locally clear the state
      // — the next focus event will pick up the missing session.
    }
    setUser(null);
    setWelcomedFor(null);
    notify?.("Sesión cerrada");
  }, [clerk, notify]);

  return {
    user,
    isAdmin: user?.role === "admin",
    hydrated,
    login,
    logout,
  };
}

/**
 * Public hook. Picks the implementation once at module load — the
 * branch is on a build-time env var so React always sees the same
 * underlying function across renders.
 */
export const useSession: typeof useSessionLegacy = IS_CLERK_ENABLED
  ? useSessionClerk
  : useSessionLegacy;
