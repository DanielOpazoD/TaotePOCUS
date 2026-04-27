import { describe, expect, it } from "vitest";

// `lib/env.ts` reads process.env once at import time and inlines via
// Next's static replacement for `NEXT_PUBLIC_*`. We test what's
// observable: the exported constants are well-formed strings.

import { ADMIN_CREDENTIALS, IS_PRODUCTION, SITE_URL } from "@/lib/env";

describe("env", () => {
  it("SITE_URL is a valid URL with no trailing slash", () => {
    expect(() => new URL(SITE_URL)).not.toThrow();
    expect(SITE_URL.endsWith("/")).toBe(false);
  });

  it("ADMIN_CREDENTIALS has lowercased email and a password", () => {
    expect(ADMIN_CREDENTIALS.email).toBe(ADMIN_CREDENTIALS.email.toLowerCase());
    expect(ADMIN_CREDENTIALS.email).toMatch(/@/);
    expect(typeof ADMIN_CREDENTIALS.password).toBe("string");
    expect(ADMIN_CREDENTIALS.password.length).toBeGreaterThan(0);
  });

  it("IS_PRODUCTION reflects NODE_ENV", () => {
    expect(typeof IS_PRODUCTION).toBe("boolean");
    expect(IS_PRODUCTION).toBe(process.env.NODE_ENV === "production");
  });
});
