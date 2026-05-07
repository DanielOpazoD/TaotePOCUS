// Tests for the Clerk-backed branch of `useSession`. The public
// `useSession` picks the implementation at module load (it depends
// on `IS_CLERK_ENABLED`); we import the named export
// `useSessionClerk` directly to drive the path under any env flag.
//
// `@clerk/nextjs` hooks are mocked: `useUser` returns whatever shape
// the test sets up, `useClerk` returns a stub with `signOut`. The
// mapper logic in `lib/clerk-auth.ts` is exercised end-to-end (no
// further mocks).

import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Clerk before importing the hook so the module captures the
// stubs at load time.
const useUserMock = vi.fn();
const signOutMock = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useUser: () => useUserMock(),
  useClerk: () => ({ signOut: signOutMock }),
}));

// Some env vars feed the role decision; default to a list that
// matches one of the test users so we can flip between admin/non-admin.
vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return {
    ...actual,
    IS_ADMIN_BYPASS_ENABLED: false,
    isAdminEmail: (email: string | null | undefined) =>
      typeof email === "string" && email.toLowerCase() === "admin@hosp.cl",
  };
});

import { useSessionClerk } from "@/hooks/useSession";

beforeEach(() => {
  useUserMock.mockReset();
  signOutMock.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

function setClerkState(state: { user: unknown; isLoaded: boolean }) {
  useUserMock.mockReturnValue(state);
}

describe("useSessionClerk", () => {
  it("starts un-hydrated while Clerk is loading", () => {
    setClerkState({ user: null, isLoaded: false });
    const { result } = renderHook(() => useSessionClerk());
    expect(result.current.user).toBeNull();
    expect(result.current.hydrated).toBe(false);
  });

  it("hydrates as anonymous when Clerk reports no user", async () => {
    setClerkState({ user: null, isLoaded: true });
    const { result } = renderHook(() => useSessionClerk());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.user).toBeNull();
    expect(result.current.isAdmin).toBe(false);
  });

  it("maps a non-admin Clerk user to a `User` with role 'user'", async () => {
    setClerkState({
      user: {
        id: "u_001",
        primaryEmailAddress: { emailAddress: "alice@example.com" },
        fullName: "Alice Example",
        publicMetadata: {},
      },
      isLoaded: true,
    });
    const notify = vi.fn();
    const { result } = renderHook(() => useSessionClerk({ notify }));
    await waitFor(() => expect(result.current.user?.email).toBe("alice@example.com"));
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.user?.role).toBe("user");
    expect(result.current.user?.name).toBe("Alice Example");
    // Welcome toast on first hydration.
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toMatch(/Hola, Alice/);
  });

  it("flags admin via Clerk publicMetadata", async () => {
    setClerkState({
      user: {
        id: "u_002",
        primaryEmailAddress: { emailAddress: "boss@somewhere.cl" },
        fullName: "Boss",
        publicMetadata: { role: "admin" },
      },
      isLoaded: true,
    });
    const { result } = renderHook(() => useSessionClerk());
    await waitFor(() => expect(result.current.user?.email).toBe("boss@somewhere.cl"));
    expect(result.current.isAdmin).toBe(true);
  });

  it("flags admin via env-var allowlist when metadata is empty", async () => {
    setClerkState({
      user: {
        id: "u_003",
        primaryEmailAddress: { emailAddress: "admin@hosp.cl" },
        fullName: "Hosp Admin",
        publicMetadata: {},
      },
      isLoaded: true,
    });
    const { result } = renderHook(() => useSessionClerk());
    await waitFor(() => expect(result.current.isAdmin).toBe(true));
  });

  it("does NOT re-toast on subsequent renders with the same user", async () => {
    setClerkState({
      user: {
        id: "u_004",
        primaryEmailAddress: { emailAddress: "alice@example.com" },
        fullName: "Alice",
        publicMetadata: {},
      },
      isLoaded: true,
    });
    const notify = vi.fn();
    const { result, rerender } = renderHook(() => useSessionClerk({ notify }));
    await waitFor(() => expect(result.current.user?.email).toBe("alice@example.com"));
    rerender();
    rerender();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("logout calls Clerk signOut and emits the toast", async () => {
    setClerkState({
      user: {
        id: "u_005",
        primaryEmailAddress: { emailAddress: "alice@example.com" },
        fullName: "Alice",
        publicMetadata: {},
      },
      isLoaded: true,
    });
    const notify = vi.fn();
    const { result } = renderHook(() => useSessionClerk({ notify }));
    await waitFor(() => expect(result.current.user).not.toBeNull());
    // signOut is the side-effect we need to verify; the user→null
    // transition happens through Clerk re-rendering with no user
    // (we don't try to simulate that here — `useUser` is hot-stubbed
    // by the parent in real life, not by the hook).
    await act(async () => {
      await result.current.logout();
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("Sesión cerrada");
  });

  it("logout swallows signOut errors instead of throwing", async () => {
    setClerkState({
      user: {
        id: "u_006",
        primaryEmailAddress: { emailAddress: "alice@example.com" },
        fullName: "Alice",
        publicMetadata: {},
      },
      isLoaded: true,
    });
    signOutMock.mockRejectedValueOnce(new Error("network down"));
    const notify = vi.fn();
    const { result } = renderHook(() => useSessionClerk({ notify }));
    await waitFor(() => expect(result.current.user).not.toBeNull());
    // No throw → the test reaches this point.
    await act(async () => {
      await result.current.logout();
    });
    expect(notify).toHaveBeenCalledWith("Sesión cerrada");
  });

  it("login is a no-op stub (Clerk's <SignIn /> owns the form)", async () => {
    setClerkState({ user: null, isLoaded: true });
    const { result } = renderHook(() => useSessionClerk());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const res = await result.current.login({ email: "a@b.c", password: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("unknown");
    }
  });
});
