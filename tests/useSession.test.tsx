import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSession } from "@/hooks/useSession";
import { Store, ADMIN_CREDS } from "@/lib/store";

describe("useSession", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no user before hydration completes", () => {
    const { result } = renderHook(() => useSession());
    // Hydration runs in useEffect; first synchronous read is empty.
    expect(result.current.user).toBeNull();
    expect(result.current.hydrated).toBe(false);
  });

  it("hydrates the persisted user on mount", async () => {
    Store.setUser({
      email: "x@y.z",
      name: "X",
      initials: "X",
      role: "user",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 1_000_000,
    });
    const { result } = renderHook(() => useSession());
    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });
    expect(result.current.user?.email).toBe("x@y.z");
    expect(result.current.isAdmin).toBe(false);
  });

  it("isAdmin reflects the persisted role", async () => {
    Store.setUser({
      email: ADMIN_CREDS.email,
      name: "Administrador",
      initials: "AD",
      role: "admin",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 1_000_000,
    });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.isAdmin).toBe(true);
  });

  it("login() with admin credentials returns ok and sets the user", async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    let res!: Awaited<ReturnType<typeof result.current.login>>;
    await act(async () => {
      res = await result.current.login({
        email: ADMIN_CREDS.email,
        password: ADMIN_CREDS.password,
      });
    });
    expect(res.ok).toBe(true);
    expect(result.current.user?.role).toBe("admin");
  });

  it("login() with wrong admin password returns the typed code", async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    let res!: Awaited<ReturnType<typeof result.current.login>>;
    await act(async () => {
      res = await result.current.login({
        email: ADMIN_CREDS.email,
        password: "wrong",
      });
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("wrong_admin_password");
      expect(res.message).toMatch(/administrador/i);
    }
  });

  it("logout() clears the persisted user and the in-memory state", async () => {
    Store.setUser({
      email: "x@y.z",
      name: "X",
      initials: "X",
      role: "user",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 1_000_000,
    });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.user).not.toBeNull());
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.user).toBeNull();
    expect(Store.getUser()).toBeNull();
  });

  it("notify is called with a friendly message after login/logout", async () => {
    const notify = vi.fn();
    const { result } = renderHook(() => useSession({ notify }));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await act(async () => {
      await result.current.login({ email: "dr@x.y", password: "p" });
    });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Hola"));
    notify.mockClear();
    await act(async () => {
      await result.current.logout();
    });
    expect(notify).toHaveBeenCalledWith("Sesión cerrada");
  });
});
