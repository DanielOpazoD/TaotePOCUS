// Repository facade — single boundary between the UI and persistence.
// Today every method delegates to the localStorage-backed `Store`.
// To migrate to Firebase (or any backend), replace the bodies below;
// the rest of the app does not change because it only sees this module.
//
// All methods are async on purpose so swapping in network calls later
// requires no caller refactor.

import { Store, type WriteResult } from "./store";
import { ADMIN_CREDENTIALS } from "./env";
import { SEED_CASES } from "./data";
import { log } from "./log";
import { AuthError } from "./errors";
import type { CaseRecord, User } from "./types";

// Session lifetimes. Admin sessions expire faster — they hold privileges,
// so the smaller blast radius if the device is left unattended matters
// more than the convenience of staying logged in.
//
// NOTE: this is a mock auth backed by localStorage. A determined user
// can edit the JSON to forge any role or extend any expiry. Real auth
// (Firebase Auth / Auth.js / a server session) is the only sound fix.
// Expiration here mainly limits the blast radius of forgotten devices.
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000; // 8 hours
const USER_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function makeUser(email: string, name: string | undefined, isAdmin: boolean): User {
  const displayName = isAdmin ? "Administrador" : name || email.split("@")[0];
  const initials = isAdmin
    ? "AD"
    : displayName
        .split(/[\s.@]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0].toUpperCase())
        .join("");
  const issuedAt = Date.now();
  const expiresAt = issuedAt + (isAdmin ? ADMIN_SESSION_MS : USER_SESSION_MS);
  return {
    email,
    name: displayName,
    initials,
    role: isAdmin ? "admin" : "user",
    issuedAt,
    expiresAt,
  };
}

function isValidUser(u: unknown): u is User {
  if (!u || typeof u !== "object") return false;
  const r = u as Partial<User>;
  return (
    typeof r.email === "string" &&
    typeof r.role === "string" &&
    (r.role === "admin" || r.role === "user") &&
    typeof r.expiresAt === "number" &&
    typeof r.issuedAt === "number"
  );
}

export const auth = {
  /**
   * Returns the current session if it exists and hasn't expired.
   * Auto-clears stale sessions so callers don't need to repeat the
   * check.
   */
  async current(): Promise<User | null> {
    const raw = Store.getUser();
    if (!raw) return null;
    // Migrate / reject sessions that don't carry the new fields.
    if (!isValidUser(raw)) {
      log.warn("Discarding malformed session", { area: "auth" });
      Store.clearUser();
      return null;
    }
    if (raw.expiresAt < Date.now()) {
      log.info("Session expired", { area: "auth", email: raw.email });
      Store.clearUser();
      return null;
    }
    return raw;
  },
  /**
   * Mock login. The admin tier is gated by hardcoded credentials — this
   * is acceptable for a demo backed by localStorage but MUST be replaced
   * by real auth (Firebase Auth / Auth.js) before any production use.
   */
  async login(email: string, password: string, name?: string): Promise<User> {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      log.warn("Login attempt with empty email", { area: "auth" });
      throw new AuthError("missing_email", "Correo requerido");
    }
    const isAdminEmail = trimmed === ADMIN_CREDENTIALS.email;
    if (isAdminEmail && password !== ADMIN_CREDENTIALS.password) {
      log.warn("Failed admin login", { area: "auth", email: trimmed });
      throw new AuthError("wrong_admin_password", "Credenciales de administrador incorrectas");
    }
    const user = makeUser(email, name, isAdminEmail);
    const result = Store.setUser(user);
    if (!result.ok) {
      log.error("Failed to persist session", { area: "auth", reason: result.reason });
      throw new AuthError("unknown", "No se pudo persistir la sesión");
    }
    log.info("Login success", {
      area: "auth",
      email: user.email,
      role: user.role,
      expiresAt: new Date(user.expiresAt).toISOString(),
    });
    return user;
  },
  async logout(): Promise<void> {
    const u = Store.getUser();
    if (u) log.info("Logout", { area: "auth", email: u.email });
    Store.clearUser();
  },
  /** Time remaining in the current session (ms). 0 if no session. */
  async msUntilExpiry(): Promise<number> {
    const u = await this.current();
    if (!u) return 0;
    return Math.max(0, u.expiresAt - Date.now());
  },
};

function isDeleted(c: CaseRecord) {
  return Boolean(c.deletedAt);
}

export const cases = {
  /** Seed cases shipped with the app (read-only). */
  async listSeed(): Promise<CaseRecord[]> {
    return SEED_CASES;
  },
  /** All admin-authored cases including soft-deleted ones. */
  async listUserRaw(): Promise<CaseRecord[]> {
    return Store.getUserCases();
  },
  /** Live admin-authored cases (excludes soft-deleted). */
  async listUser(): Promise<CaseRecord[]> {
    return (await this.listUserRaw()).filter((c) => !isDeleted(c));
  },
  /** Soft-deleted cases — visible to admin only, in the trash view. */
  async listTrashed(): Promise<CaseRecord[]> {
    return (await this.listUserRaw()).filter(isDeleted);
  },
  /** Combined list as shown in the public UI. Excludes soft-deleted. */
  async listAll(): Promise<CaseRecord[]> {
    const [seed, user] = await Promise.all([this.listSeed(), this.listUser()]);
    return [...user, ...seed];
  },
  async save(c: CaseRecord, current: CaseRecord[]): Promise<WriteResult> {
    const exists = current.some((x) => x.id === c.id);
    const next = exists ? current.map((x) => (x.id === c.id ? c : x)) : [c, ...current];
    return Store.setUserCases(next);
  },
  /**
   * Soft-delete: marks the case as deleted but keeps the row in storage
   * so it can be restored. The audit trail (`deletedAt`, `deletedBy`)
   * is visible from the admin trash view.
   */
  async remove(id: string, current: CaseRecord[], by?: string): Promise<WriteResult> {
    const stamp = new Date().toISOString();
    const next = current.map((c) =>
      c.id === id ? { ...c, deletedAt: stamp, deletedBy: by || "unknown" } : c,
    );
    log.info("Case soft-deleted", { area: "cases", id, by });
    return Store.setUserCases(next);
  },
  async restore(id: string, current: CaseRecord[]): Promise<WriteResult> {
    const next = current.map((c) =>
      c.id === id ? { ...c, deletedAt: undefined, deletedBy: undefined } : c,
    );
    log.info("Case restored", { area: "cases", id });
    return Store.setUserCases(next);
  },
  /** Hard-delete from storage. Use only from the trash view. */
  async purge(id: string, current: CaseRecord[]): Promise<WriteResult> {
    const next = current.filter((c) => c.id !== id);
    log.info("Case purged", { area: "cases", id });
    return Store.setUserCases(next);
  },
};

export const favs = {
  async list(email?: string | null): Promise<string[]> {
    return Store.getFavs(email);
  },
  async toggle(
    email: string | null | undefined,
    id: string,
    current: string[],
  ): Promise<{ result: WriteResult; next: string[] }> {
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    const result = Store.setFavs(email, next);
    return { result, next };
  },
};

export const repo = { auth, cases, favs };
