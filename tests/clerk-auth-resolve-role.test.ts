// Pin the role-decision rule. `resolveRole` is the single source of
// truth that both `lib/server/session.ts > getClerkSession` and
// `lib/clerk-auth.ts > isAdminFromClerkUser` route through. Any
// drift in the rule will be loud here first.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `lib/env > isAdminEmail` reads from the `ADMIN_EMAILS` env var. We
// pin a tiny allowlist via mock so the test doesn't depend on
// process.env at import time.
vi.mock("@/lib/env", () => ({
  isAdminEmail: (email: string | null | undefined) =>
    !!email && ["ops@example.com", "lead@example.com"].includes(email.toLowerCase()),
}));

import { resolveRole, isAdminFromClerkUser, type ClerkUserLike } from "@/lib/clerk-auth";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveRole — the canonical admin-decision rule", () => {
  // ─── Path 1: publicMetadata.role ────────────────────────────────
  describe("publicMetadata.role grants admin (Clerk dashboard path)", () => {
    it("admin when role === 'admin' (lowercase)", () => {
      expect(resolveRole({ email: "anyone@x.com", publicMetadataRole: "admin" })).toBe("admin");
    });

    it("admin when role === 'ADMIN' (case-insensitive)", () => {
      expect(resolveRole({ email: "anyone@x.com", publicMetadataRole: "ADMIN" })).toBe("admin");
    });

    it("admin when role === 'Admin' (mixed case)", () => {
      expect(resolveRole({ email: "anyone@x.com", publicMetadataRole: "Admin" })).toBe("admin");
    });

    it("user when role is some other string", () => {
      expect(resolveRole({ email: "anyone@x.com", publicMetadataRole: "moderator" })).toBe("user");
    });

    it("user when role is missing (undefined)", () => {
      expect(resolveRole({ email: "anyone@x.com", publicMetadataRole: undefined })).toBe("user");
    });

    it("user when role is null", () => {
      expect(resolveRole({ email: "anyone@x.com", publicMetadataRole: null })).toBe("user");
    });

    it("user when role is the number 1 (truthy but not a string)", () => {
      expect(resolveRole({ email: "anyone@x.com", publicMetadataRole: 1 })).toBe("user");
    });

    it("user when role is the boolean true", () => {
      expect(resolveRole({ email: "anyone@x.com", publicMetadataRole: true })).toBe("user");
    });
  });

  // ─── Path 2: ADMIN_EMAILS allowlist ─────────────────────────────
  describe("ADMIN_EMAILS allowlist grants admin (bootstrap / safety net)", () => {
    it("admin when email is in the allowlist (no metadata required)", () => {
      expect(resolveRole({ email: "ops@example.com", publicMetadataRole: undefined })).toBe(
        "admin",
      );
    });

    it("user when email is not in the allowlist", () => {
      expect(resolveRole({ email: "stranger@x.com", publicMetadataRole: undefined })).toBe("user");
    });
  });

  // ─── Both paths together ────────────────────────────────────────
  describe("paths are independent", () => {
    it("admin when both metadata AND allowlist agree", () => {
      expect(resolveRole({ email: "ops@example.com", publicMetadataRole: "admin" })).toBe("admin");
    });

    it("admin when metadata says admin but allowlist does not contain the email", () => {
      expect(resolveRole({ email: "stranger@x.com", publicMetadataRole: "admin" })).toBe("admin");
    });

    it("admin when allowlist contains the email but metadata is unset", () => {
      expect(resolveRole({ email: "ops@example.com", publicMetadataRole: null })).toBe("admin");
    });

    it("user when neither path grants (unknown email + no metadata)", () => {
      expect(resolveRole({ email: "stranger@x.com", publicMetadataRole: null })).toBe("user");
    });
  });

  // ─── Edge: missing email ────────────────────────────────────────
  describe("missing email", () => {
    it("admin if metadata says admin even when email is null (the metadata path doesn't depend on email)", () => {
      expect(resolveRole({ email: null, publicMetadataRole: "admin" })).toBe("admin");
    });

    it("user when email is null and metadata is unset", () => {
      expect(resolveRole({ email: null, publicMetadataRole: null })).toBe("user");
    });
  });
});

describe("isAdminFromClerkUser — adapter that wraps resolveRole", () => {
  function userLike(overrides: Partial<ClerkUserLike> = {}): ClerkUserLike {
    return {
      id: "user_1",
      primaryEmailAddress: { emailAddress: "u@x.com" },
      emailAddresses: [{ id: "ea_1", emailAddress: "u@x.com" }],
      primaryEmailAddressId: "ea_1",
      publicMetadata: {},
      ...overrides,
    };
  }

  it("returns false for a plain user (not in allowlist, no admin metadata)", () => {
    expect(isAdminFromClerkUser(userLike())).toBe(false);
  });

  it("returns true when publicMetadata.role grants admin", () => {
    expect(isAdminFromClerkUser(userLike({ publicMetadata: { role: "admin" } }))).toBe(true);
  });

  it("returns true when the resolved primary email is in the allowlist", () => {
    expect(
      isAdminFromClerkUser(
        userLike({
          primaryEmailAddress: { emailAddress: "ops@example.com" },
          emailAddresses: [{ id: "ea_1", emailAddress: "ops@example.com" }],
        }),
      ),
    ).toBe(true);
  });

  it("falls back to the first emailAddresses entry when primary id doesn't match", () => {
    expect(
      isAdminFromClerkUser(
        userLike({
          primaryEmailAddress: null,
          primaryEmailAddressId: "missing",
          emailAddresses: [
            { id: "ea_1", emailAddress: "ops@example.com" },
            { id: "ea_2", emailAddress: "noise@x.com" },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("returns false when the user has no email AND no admin metadata", () => {
    expect(
      isAdminFromClerkUser(
        userLike({
          primaryEmailAddress: null,
          primaryEmailAddressId: null,
          emailAddresses: [],
        }),
      ),
    ).toBe(false);
  });

  it("returns true when metadata says admin even with no email (metadata path doesn't depend on it)", () => {
    expect(
      isAdminFromClerkUser(
        userLike({
          primaryEmailAddress: null,
          primaryEmailAddressId: null,
          emailAddresses: [],
          publicMetadata: { role: "admin" },
        }),
      ),
    ).toBe(true);
  });
});
