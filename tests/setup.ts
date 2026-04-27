// Global Vitest setup. Runs once before each test file.
//
// Polyfills: happy-dom doesn't ship `matchMedia`, `IntersectionObserver`,
// or `ResizeObserver`. Several components/hooks reference them at module
// scope or in effects, so we provide minimal mocks here. Tests that want
// richer behavior can override on a per-suite basis.

import { afterEach, beforeEach, vi } from "vitest";

// ─── matchMedia ───────────────────────────────────────────────────────────
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // legacy
      removeListener: vi.fn(), // legacy
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

// ─── IntersectionObserver ─────────────────────────────────────────────────
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
  root: Element | null = null;
  rootMargin = "";
  thresholds: ReadonlyArray<number> = [];
  constructor() {}
}
if (!("IntersectionObserver" in window)) {
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    MockIntersectionObserver;
}

// ─── ResizeObserver ───────────────────────────────────────────────────────
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
if (!("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
}

// ─── Per-test isolation ──────────────────────────────────────────────────
// localStorage leaks across tests in the same file because happy-dom
// mounts one DOM. Clear after each test so suites stay independent
// regardless of order.
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

// Make sure each test starts with a deterministic `Date.now()` lower
// bound. Tests that need precise control can use `vi.useFakeTimers()`.
beforeEach(() => {
  vi.useRealTimers();
});
