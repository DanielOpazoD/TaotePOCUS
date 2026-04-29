import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useCountUp } from "@/hooks/useCountUp";

// Minimal harness component: attaches the hook's ref to a real DOM
// element so the effect's `if (!el) return` guard doesn't bail. Used
// instead of renderHook because the hook explicitly depends on the
// element being present in the DOM at effect time.
function Harness({ target, duration }: { target: number; duration?: number }) {
  const { ref, value } = useCountUp<HTMLSpanElement>(target, duration ? { duration } : undefined);
  return (
    <span ref={ref} data-testid="counter">
      {value}
    </span>
  );
}

// IO mock that captures the callback so the test can fire an
// "intersecting" entry on demand. Resets per-test in beforeEach.
const ioState: { cb: IntersectionObserverCallback | null; el: Element | null } = {
  cb: null,
  el: null,
};
function installIO() {
  ioState.cb = null;
  ioState.el = null;
  // Using a class so the read-only IO properties (root, rootMargin,
  // thresholds) can be defined as proper getters; assigning to them
  // on a function-built instance triggers TS2540.
  class MockIO {
    root: Element | null = null;
    rootMargin = "";
    thresholds: ReadonlyArray<number> = [];
    constructor(cb: IntersectionObserverCallback) {
      ioState.cb = cb;
    }
    observe(el: Element) {
      ioState.el = el;
    }
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  globalThis.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;
}
function fireIntersection() {
  if (!ioState.cb || !ioState.el) return;
  ioState.cb(
    [
      {
        isIntersecting: true,
        target: ioState.el,
        intersectionRatio: 1,
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
        time: 0,
      } as IntersectionObserverEntry,
    ],
    {} as IntersectionObserver,
  );
}

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: () => ({
      matches,
      media: matches ? "(prefers-reduced-motion: reduce)" : "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

describe("useCountUp", () => {
  beforeEach(() => {
    setReducedMotion(false);
    installIO();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts at 0 before the element enters the viewport", () => {
    const { getByTestId } = render(<Harness target={42} />);
    expect(getByTestId("counter").textContent).toBe("0");
  });

  it("reaches the target after the element enters the viewport", async () => {
    const { getByTestId, rerender } = render(<Harness target={10} duration={50} />);
    fireIntersection();
    // Wait for RAF + duration to complete. Easier than fake timers
    // because the hook uses requestAnimationFrame which interacts
    // poorly with vi.useFakeTimers in some setups.
    await new Promise((r) => setTimeout(r, 100));
    rerender(<Harness target={10} duration={50} />);
    expect(getByTestId("counter").textContent).toBe("10");
  });

  it("snaps to target immediately under prefers-reduced-motion", async () => {
    setReducedMotion(true);
    const { getByTestId } = render(<Harness target={42} />);
    // The hook short-circuits inside the mount effect — no IO
    // observation, no animation. After a tick the value is final.
    await new Promise((r) => setTimeout(r, 0));
    expect(getByTestId("counter").textContent).toBe("42");
  });

  it("snaps to target when IntersectionObserver is unavailable", async () => {
    // @ts-expect-error — simulating an old browser.
    globalThis.IntersectionObserver = undefined;
    const { getByTestId } = render(<Harness target={99} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(getByTestId("counter").textContent).toBe("99");
  });

  it("does not start the animation while the element is outside the viewport", async () => {
    const { getByTestId } = render(<Harness target={10} duration={20} />);
    // Don't fire intersection. The IO mock's observer never receives
    // an intersecting entry, so the value stays at 0.
    await new Promise((r) => setTimeout(r, 50));
    expect(getByTestId("counter").textContent).toBe("0");
  });
});
