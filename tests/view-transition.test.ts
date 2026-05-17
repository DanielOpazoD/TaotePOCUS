// Tests for the `lib/view-transition.ts` helper. Cover:
//   - Feature detection: missing `startViewTransition` → fallback.
//   - Reduced motion: matched media query → fallback.
//   - Available + motion accepted → call into the API.
//   - Callback ALWAYS runs (the helper never swallows).
//
// The `caseThumbViewTransitionName` tests were dropped in May-2026
// when PR #79 ripped the case-thumb→modal morph (the only caller).
// See `lib/view-transition.ts` header for the full history.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWithViewTransition } from "@/lib/view-transition";

// Snapshot of the relevant document globals so each test sees a
// known starting state. The helper reads `document.startViewTransition`
// and `window.matchMedia` — both stubbed/restored here.
const originalStartFn = (document as unknown as Record<string, unknown>).startViewTransition;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  // happy-dom doesn't ship startViewTransition by default — delete to be
  // sure each test starts without it. Tests that need it set the stub.
  delete (document as unknown as Record<string, unknown>).startViewTransition;
});

afterEach(() => {
  if (originalStartFn === undefined) {
    delete (document as unknown as Record<string, unknown>).startViewTransition;
  } else {
    (document as unknown as Record<string, unknown>).startViewTransition = originalStartFn;
  }
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe("runWithViewTransition", () => {
  it("calls the callback synchronously when the API is missing", () => {
    const cb = vi.fn();
    const result = runWithViewTransition(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it("calls the callback through startViewTransition when supported", () => {
    const transitionStub = {
      finished: Promise.resolve(),
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: vi.fn(),
    };
    const startFn = vi.fn((cb: () => void) => {
      cb();
      return transitionStub;
    });
    (document as unknown as Record<string, unknown>).startViewTransition = startFn;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    })) as unknown as typeof window.matchMedia;

    const cb = vi.fn();
    const result = runWithViewTransition(cb);
    expect(startFn).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(result).toBe(transitionStub);
  });

  it("falls back to a plain call when prefers-reduced-motion: reduce", () => {
    const startFn = vi.fn();
    (document as unknown as Record<string, unknown>).startViewTransition = startFn;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    })) as unknown as typeof window.matchMedia;

    const cb = vi.fn();
    runWithViewTransition(cb);
    expect(startFn).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("never swallows the callback even if startViewTransition throws", () => {
    // Browser docs guarantee invocation, but our wrapper checks
    // typeof first so a malformed API surface still runs the
    // callback. Pin that.
    (document as unknown as Record<string, unknown>).startViewTransition = "not a function";
    const cb = vi.fn();
    runWithViewTransition(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
