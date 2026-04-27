/**
 * Firebase Auth implementation of the `auth` namespace from `lib/repo.ts`.
 *
 * Active only when `IS_FIREBASE_ENABLED` is true. The repo facade picks
 * this implementation at boot; callers never import from here directly.
 *
 * Admin role gating
 * -----------------
 * Without server-side custom claims (which require Cloud Functions or
 * the Admin SDK), we determine "admin" client-side by comparing the
 * email to `NEXT_PUBLIC_ADMIN_EMAIL`. Real production should add a
 * Firestore `users/{uid}` doc with `role` and a Firestore rule that
 * gates writes — see ADR-0004 for the migration plan.
 *
 * Session expiry follows the same lifetimes as the mock (admin 8 h,
 * user 30 d). Firebase tokens auto-refresh, but we still surface
 * `expiresAt` so the UI shows "tu sesión expiró" toasts on focus.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { firebaseAuth } from "./firebase";
import { ADMIN_CREDENTIALS } from "./env";
import { AuthError } from "./errors";
import { log } from "./log";
import type { User } from "./types";

const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;
const USER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function toAppUser(fb: FirebaseUser, displayName?: string): User {
  // Firebase users without an email shouldn't reach here (sign-in
  // requires email). Defensive fallback to "" keeps types honest.
  const email = fb.email ?? "";
  const isAdmin = email.toLowerCase() === ADMIN_CREDENTIALS.email;
  const name = isAdmin
    ? "Administrador"
    : displayName || fb.displayName || email.split("@")[0] || email;
  const initials = isAdmin
    ? "AD"
    : name
        .split(/[\s.@]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => (s[0] ?? "").toUpperCase())
        .join("");
  const issuedAt = Date.now();
  const expiresAt = issuedAt + (isAdmin ? ADMIN_SESSION_MS : USER_SESSION_MS);
  return {
    email,
    name,
    initials,
    role: isAdmin ? "admin" : "user",
    issuedAt,
    expiresAt,
  };
}

export const firebaseAuthRepo = {
  async current(): Promise<User | null> {
    const auth = firebaseAuth();
    if (!auth) return null;
    const fb = auth.currentUser;
    if (!fb || !fb.email) return null;
    return toAppUser(fb);
  },

  async login(email: string, password: string, name?: string): Promise<User> {
    const auth = firebaseAuth();
    if (!auth) throw new AuthError("unknown", "Firebase no está disponible");

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      log.warn("Login attempt with empty email", { area: "auth" });
      throw new AuthError("missing_email", "Correo requerido");
    }

    const isAdminEmail = trimmed === ADMIN_CREDENTIALS.email;

    try {
      // We try to sign in. If the user doesn't exist and this isn't the
      // admin email, register a new account so the demo flow stays
      // identical to the mock. For admin we *only* sign in — never
      // auto-create — to avoid silently provisioning admin if the
      // password is wrong.
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, trimmed, password);
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
          if (isAdminEmail) {
            log.warn("Failed admin login (Firebase)", { area: "auth", email: trimmed });
            throw new AuthError(
              "wrong_admin_password",
              "Credenciales de administrador incorrectas",
            );
          }
          // First-time sign-in for a regular user: create the account.
          cred = await createUserWithEmailAndPassword(auth, trimmed, password);
        } else if (code === "auth/wrong-password") {
          throw new AuthError(
            isAdminEmail ? "wrong_admin_password" : "unknown",
            isAdminEmail ? "Credenciales de administrador incorrectas" : "Contraseña incorrecta",
          );
        } else {
          throw e;
        }
      }

      const user = toAppUser(cred.user, name);
      log.info("Login success (Firebase)", {
        area: "auth",
        email: user.email,
        role: user.role,
        expiresAt: new Date(user.expiresAt).toISOString(),
      });
      return user;
    } catch (e) {
      if (e instanceof AuthError) throw e;
      log.error("Unexpected Firebase auth error", { area: "auth" }, e);
      throw new AuthError("unknown", "No se pudo iniciar sesión");
    }
  },

  async logout(): Promise<void> {
    const auth = firebaseAuth();
    if (!auth) return;
    const u = auth.currentUser;
    if (u) log.info("Logout (Firebase)", { area: "auth", email: u.email ?? "" });
    await fbSignOut(auth);
  },

  async msUntilExpiry(): Promise<number> {
    const u = await this.current();
    if (!u) return 0;
    return Math.max(0, u.expiresAt - Date.now());
  },
};
