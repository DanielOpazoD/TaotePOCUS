// Unit tests for `withRetry`. The helper is the new shared
// retry primitive — every wire that adopts it depends on these
// semantics holding.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTransient, withRetry } from "@/lib/errors/retry";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves on the first try when the fn succeeds", async () => {
    const fn = vi.fn(async () => "ok");
    const promise = withRetry(fn);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries up to maxAttempts then rethrows the last error", async () => {
    const err = new Error("boom");
    const fn = vi.fn(async () => {
      throw err;
    });
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("succeeds on a later attempt if the fn eventually returns", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("transient");
      return "recovered";
    });
    const promise = withRetry(fn, { maxAttempts: 5, baseDelayMs: 10 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops retrying when shouldRetry returns false", async () => {
    const err = new Error("permanent");
    const fn = vi.fn(async () => {
      throw err;
    });
    const promise = withRetry(fn, {
      maxAttempts: 5,
      baseDelayMs: 10,
      shouldRetry: () => false,
    });
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBe(err);
    // No retries — single try then rethrow.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls shouldRetry with the error + attempt index", async () => {
    const err = new Error("retryable");
    const fn = vi.fn(async () => {
      throw err;
    });
    const shouldRetry = vi.fn(() => true);
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, shouldRetry });
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBe(err);
    // Called for attempts 0 and 1 (the third attempt is the last,
    // shouldRetry isn't consulted there).
    expect(shouldRetry).toHaveBeenCalledWith(err, 0);
    expect(shouldRetry).toHaveBeenCalledWith(err, 1);
  });

  it("rejects immediately when the AbortSignal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn(async () => "should not run");
    const promise = withRetry(fn, {
      maxAttempts: 5,
      baseDelayMs: 50,
      signal: controller.signal,
    });
    await expect(promise).rejects.toThrow();
    // The signal check fires BEFORE the first invocation — no call.
    expect(fn).toHaveBeenCalledTimes(0);
  });
});

describe("isTransient", () => {
  it("classifies network TypeError as transient", () => {
    expect(isTransient(new TypeError("fetch failed"))).toBe(true);
  });

  it("classifies HTTP 503 errors as transient", () => {
    expect(isTransient(new Error("HTTP 503"))).toBe(true);
    expect(isTransient(new Error("HTTP 500"))).toBe(true);
    expect(isTransient(new Error("HTTP 429 — rate limited"))).toBe(true);
    expect(isTransient(new Error("HTTP 408 — timeout"))).toBe(true);
  });

  it("classifies HTTP 4xx (except 408/429) as NOT transient", () => {
    expect(isTransient(new Error("HTTP 400"))).toBe(false);
    expect(isTransient(new Error("HTTP 401"))).toBe(false);
    expect(isTransient(new Error("HTTP 403"))).toBe(false);
    expect(isTransient(new Error("HTTP 404"))).toBe(false);
    expect(isTransient(new Error("HTTP 422"))).toBe(false);
  });

  it("classifies plain Error / unknown shapes as NOT transient", () => {
    expect(isTransient(new Error("something went wrong"))).toBe(false);
    expect(isTransient("string error")).toBe(false);
    expect(isTransient(null)).toBe(false);
    expect(isTransient(undefined)).toBe(false);
    expect(isTransient({ message: "object" })).toBe(false);
  });
});
