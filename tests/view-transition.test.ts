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
//
// Note: `Document.startViewTransition` IS typed in lib.dom (TS 5.6+),
// but happy-dom doesn't ship it. We delete + reassign through a
// narrow optional-property type. `Omit` is necessary because a plain
// intersection (`Document & { ... }`) keeps the property required
// from the base, and `delete` rejects required properties.
type StartFn = Document["startViewTransition"];
type DocumentWithOptionalStart = Omit<Document, "startViewTransition"> & {
  startViewTransition?: StartFn;
};

const originalStartFn = (document as DocumentWithOptionalStart).startViewTransition;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  // happy-dom doesn't ship startViewTransition by default — delete to be
  // sure each test starts without it. Tests that need it set the stub.
  delete (document as DocumentWithOptionalStart).startViewTransition;
});

afterEach(() => {
  if (originalStartFn === undefined) {
    delete (document as DocumentWithOptionalStart).startViewTransition;
  } else {
    (document as DocumentWithOptionalStart).startViewTransition = originalStartFn;
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
    // `ViewTransition` in lib.dom (TS 5.6+) requires `types` —
    // the read-only Set of transition-type names declared at start
    // time. Tests use an empty Set so the mock satisfies the full
    // contract.
    const transitionStub: ViewTransition = {
      finished: Promise.resolve(),
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: vi.fn(),
      types: new Set<string>(),
    };
    const startFn = vi.fn((cb: () => void) => {
      cb();
      return transitionStub;
    });
    (document as DocumentWithOptionalStart).startViewTransition = startFn;
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
    (document as DocumentWithOptionalStart).startViewTransition = startFn;
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
    //
    // The cast is intentionally LOOSER than the typed
    // `DocumentWithOptionalStart` because the test is asserting
    // that we survive a runtime where `startViewTransition` is
    // not a function — a state the type system forbids by
    // construction. The cast documents "I'm violating the type
    // contract on purpose to test our defensiveness".
    (document as unknown as { startViewTransition: unknown }).startViewTransition =
      "not a function";
    const cb = vi.fn();
    runWithViewTransition(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
