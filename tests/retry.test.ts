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
    // Pre-attach a no-op handler so the eventual rejection isn't flagged
    // as an unhandled-promise event when `runAllTimersAsync` drives the
    // retry loop to terminal `throw err` synchronously inside the fake-
    // timer advance — the `expect(promise).rejects` handler below only
    // attaches AFTER `runAllTimersAsync` returns, so without this guard
    // there's a window where the rejection has no handler and CI's
    // strict-rejection harness exits 1. Attaching another `.catch`
    // doesn't consume the original rejection chain, just marks it
    // "handled" from Node's perspective.
    promise.catch(() => {});
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
    promise.catch(() => {}); // see note in earlier test re: unhandled-rejection guard
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
    promise.catch(() => {}); // see note in earlier test re: unhandled-rejection guard
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

  // Two paths inside the internal `sleep()` helper (lines 130-141 in
  // retry.ts). Reached only through withRetry's inter-attempt backoff,
  // not directly. Cover both:
  //   (a) signal already aborted when sleep() is entered → immediate
  //       reject from the `if (signal?.aborted)` branch.
  //   (b) signal aborts AFTER sleep() schedules its timer → the
  //       onAbort listener fires and rejects.

  it("propagates an abort that lands between attempts (sleep-entry abort)", async () => {
    // The trick is to abort the signal during shouldRetry — after the
    // first attempt's failure is observed but before sleep() is called.
    // That makes sleep see signal.aborted === true on entry.
    const controller = new AbortController();
    const fn = vi.fn(async () => {
      throw new Error("flaky");
    });
    const shouldRetry = vi.fn(() => {
      // Abort during the retry-decision step — this runs synchronously
      // between the catch block and the await sleep().
      controller.abort(new Error("signal-trip"));
      return true;
    });
    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      shouldRetry,
      signal: controller.signal,
    });
    promise.catch(() => {}); // unhandled-rejection guard, same as the rejection tests above
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(/signal-trip/);
    // First attempt ran, sleep saw the abort, no second attempt.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("propagates an abort that lands DURING the inter-attempt sleep (onAbort listener)", async () => {
    // Here we let sleep() schedule its timer and register its onAbort
    // listener, then abort mid-flight. The onAbort handler runs, calls
    // cleanup, and rejects the sleep promise — covering lines 138-141.
    const controller = new AbortController();
    const fn = vi.fn(async () => {
      throw new Error("flaky");
    });
    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 50,
      signal: controller.signal,
    });
    promise.catch(() => {});
    // Let the first attempt resolve its rejection + queue the sleep timer.
    // Two advanceTimersByTimeAsync(0) ticks flush the microtask queue
    // without consuming the 50ms backoff.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    // Sleep is now in flight (timer queued, listener attached). Abort.
    controller.abort(new Error("mid-sleep-trip"));
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(/mid-sleep-trip/);
    expect(fn).toHaveBeenCalledTimes(1);
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
