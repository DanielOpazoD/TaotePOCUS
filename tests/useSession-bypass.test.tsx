import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// The bypass flag is read at module load, so we override the env
// module before the hook is imported. A separate test file (rather
// than a `vi.mock` inside the existing tests/useSession.test.tsx)
// keeps the mock scoped — other useSession tests run with the
// real env constants intact.
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    IS_ADMIN_BYPASS_ENABLED: true,
  };
});

import { useSession } from "@/hooks/useSession";

describe("useSession admin bypass", () => {
  it("auto-mounts a synthetic admin session when the bypass flag is on", async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.user).not.toBeNull();
    expect(result.current.user?.role).toBe("admin");
    expect(result.current.isAdmin).toBe(true);
  });

  it("uses ADMIN_CREDENTIALS.email for the bypass user", async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.user?.email).toBe("admin@taote.pocus");
  });

  it("attaches a long-running expiresAt so the dev session doesn't expire mid-edit", async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const now = Date.now();
    // Should be at least 7 days out.
    expect((result.current.user?.expiresAt ?? 0) - now).toBeGreaterThan(7 * 24 * 3_600_000);
  });
});
