import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Store } from "@/lib/store";
import type { CaseRecord } from "@/lib/types";

describe("Store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getUser returns null when no user is stored", () => {
    expect(Store.getUser()).toBeNull();
  });

  it("setUser then getUser round-trips", () => {
    const u = {
      email: "x@y.z",
      name: "X",
      initials: "X",
      role: "user" as const,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 1000,
    };
    const r = Store.setUser(u);
    expect(r.ok).toBe(true);
    expect(Store.getUser()).toEqual(u);
  });

  it("getFavs returns [] for unknown email", () => {
    expect(Store.getFavs("ghost@x.y")).toEqual([]);
  });

  it("setFavs/getFavs scoped per email", () => {
    Store.setFavs("a@x.y", ["c1"]);
    Store.setFavs("b@x.y", ["c2", "c3"]);
    expect(Store.getFavs("a@x.y")).toEqual(["c1"]);
    expect(Store.getFavs("b@x.y")).toEqual(["c2", "c3"]);
  });

  it("getUserCases tolerates corrupted JSON", () => {
    localStorage.setItem("pocus_user_cases", "not json");
    expect(Store.getUserCases()).toEqual([]);
  });

  it("setUserCases reports quota errors instead of throwing", () => {
    const big: CaseRecord[] = Array(1).fill({}) as CaseRecord[];
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      const err = new Error("Quota exceeded");
      (err as { name: string }).name = "QuotaExceededError";
      throw err;
    });
    const r = Store.setUserCases(big);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("quota");
    spy.mockRestore();
  });

  it("setUserCases reports unknown errors with the right reason", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("disk gremlin");
    });
    const r = Store.setUserCases([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
    spy.mockRestore();
  });

  it("estimateUsage counts only pocus_* keys", () => {
    localStorage.setItem("unrelated", "x".repeat(100));
    Store.setUser({
      email: "a@b.c",
      name: "A B",
      initials: "AB",
      role: "user",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 1000,
    });
    const used = Store.estimateUsage();
    expect(used).toBeGreaterThan(0);
    expect(used).toBeLessThan(2 * 1024); // way under the 100-byte unrelated key
  });
});
