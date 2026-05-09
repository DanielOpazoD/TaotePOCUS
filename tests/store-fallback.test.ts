// `Store` falls back to an in-memory shim when localStorage is
// unavailable (Safari Private Mode, sandboxed iframe). The fallback
// preserves API shape — Store.getFavs / setUserCases / etc. keep
// working — but the data lives only for the lifetime of the tab.
//
// Here we simulate localStorage throwing on the probe write and
// assert the shim absorbs subsequent operations cleanly.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Store, __resetStorageBackendForTests, isUsingMemoryStorage } from "@/lib/store";

describe("Store — in-memory fallback when localStorage throws", () => {
  beforeEach(() => {
    __resetStorageBackendForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetStorageBackendForTests();
    localStorage.clear();
  });

  it("flips to memory backend when the probe write throws", () => {
    // Patch the localStorage instance so the FIRST write (the probe)
    // throws — Safari Private Mode behaviour.
    let throwOn = "any";
    vi.spyOn(localStorage, "setItem").mockImplementation((key: string, value: string) => {
      if (throwOn !== "none") {
        const e: Error & { name?: string } = new Error("storage disabled");
        e.name = "QuotaExceededError";
        throw e;
      }
      // Fallback to real impl when the test toggles it off.
      const desc = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem");
      desc?.value?.call(localStorage, key, value);
    });

    // Probe runs lazily on first call.
    expect(isUsingMemoryStorage()).toBe(true);

    // Now writes succeed against the in-memory shim.
    throwOn = "none";
    const result = Store.setUserCases([]);
    expect(result.ok).toBe(true);
  });

  it("memory backend isolates round-trip: setFavs → getFavs returns the list", () => {
    // Force memory by failing the probe.
    vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
      throw new Error("private mode");
    });
    __resetStorageBackendForTests();
    expect(isUsingMemoryStorage()).toBe(true);

    const writeResult = Store.setFavs("admin@x.com", ["c1", "c2", "c3"]);
    expect(writeResult.ok).toBe(true);
    expect(Store.getFavs("admin@x.com")).toEqual(["c1", "c2", "c3"]);
  });

  it("memory backend supports clearUser / removal", () => {
    vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
      throw new Error("private mode");
    });
    __resetStorageBackendForTests();

    Store.setUser({
      email: "admin@x.com",
      name: "A",
      initials: "AA",
      role: "admin",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 1_000_000,
    });
    expect(Store.getUser()?.email).toBe("admin@x.com");

    Store.clearUser();
    expect(Store.getUser()).toBeNull();
  });

  it("memory backend has no quota limit (Map-backed) — large writes succeed", () => {
    vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
      throw new Error("private mode");
    });
    __resetStorageBackendForTests();

    // Build a fav list bigger than what real localStorage would
    // typically hold (~5 MB of JSON). The shim accepts it.
    const big = Array.from({ length: 100_000 }, (_, i) => `c-${i}`);
    const result = Store.setFavs("admin@x.com", big);
    expect(result.ok).toBe(true);
    expect(Store.getFavs("admin@x.com")).toHaveLength(100_000);
  });

  it("isUsingMemoryStorage stays false when localStorage is functional", () => {
    // Default happy-dom setup — no patches, real localStorage works.
    __resetStorageBackendForTests();
    expect(isUsingMemoryStorage()).toBe(false);
  });

  it("estimateUsage works against the memory backend", () => {
    vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
      throw new Error("private mode");
    });
    __resetStorageBackendForTests();

    Store.setFavs("admin@x.com", ["c1"]);
    Store.setUserCases([]);
    // Should not throw and should return a non-zero number.
    expect(Store.estimateUsage()).toBeGreaterThan(0);
  });
});
