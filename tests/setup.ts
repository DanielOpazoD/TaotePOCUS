// Global Vitest setup. Runs once before each test file.
//
// Polyfills: happy-dom doesn't ship `matchMedia`, `IntersectionObserver`,
// or `ResizeObserver`. Several components/hooks reference them at module
// scope or in effects, so we provide minimal mocks here. Tests that want
// richer behavior can override on a per-suite basis.

import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

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

// ─── Server Action: session cookie ────────────────────────────────────────
// `lib/repo > localAuth.login/.logout` fires `setSessionAction` /
// `clearSessionAction` to mint and clear the server-side session cookie.
// Those actions depend on `next/headers > cookies()` which only works
// inside a real request context — happy-dom doesn't provide one, so
// importing the real module would throw at call time. Mock it globally
// to a no-op resolver. Suites that exercise the actions directly can
// override per-file.
vi.mock("@/app/actions/session", () => ({
  setSessionAction: vi.fn().mockResolvedValue({ ok: true }),
  clearSessionAction: vi.fn().mockResolvedValue({ ok: true }),
}));

// ─── next/navigation router ───────────────────────────────────────────────
// The TransitionLink component (chrome) calls `useRouter()` to wrap
// navigations in startViewTransition. Outside of the App Router runtime
// that hook throws "invariant expected app router to be mounted". Mock
// it globally so component tests work without each suite repeating the
// boilerplate. Test files that need router-level behavior can override
// with their own `vi.mock("next/navigation", ...)` — Vitest gives the
// per-file mock priority over this default.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// ─── Corpus fetch shim ───────────────────────────────────────────────────
// Bloque O moved the imported-cases corpus from a TS array literal to a
// JSON file under `public/data/`. The runtime loader picks `fetch()` in
// the browser and `fs.readFile()` on the server. happy-dom defines
// `window`, so the loader takes the browser path — but there's no
// server to fetch from in vitest. Shim `fetch` to resolve the JSON
// directly off disk for the corpus URL only; everything else falls
// through to whatever the test (or the underlying happy-dom fetch)
// expects.
const __originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const url = typeof input === "string" ? input : (input as URL | Request).toString();
  if (url === "/data/imported-cases.json" || url.endsWith("/data/imported-cases.json")) {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const full = join(process.cwd(), "public", "data", "imported-cases.json");
    const body = await readFile(full, "utf8");
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (typeof __originalFetch === "function") {
    return __originalFetch(input as RequestInfo, init);
  }
  return new Response("", { status: 404 });
}) as typeof fetch;

// ─── Per-test isolation ──────────────────────────────────────────────────
// localStorage leaks across tests in the same file because happy-dom
// mounts one DOM. Clear after each test so suites stay independent
// regardless of order.
afterEach(() => {
  // RTL doesn't auto-cleanup with the Vitest runner — explicit unmount
  // here keeps each test's DOM independent. Without this, querying by
  // data-testid finds elements from previous tests.
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

// Make sure each test starts with a deterministic `Date.now()` lower
// bound. Tests that need precise control can use `vi.useFakeTimers()`.
beforeEach(() => {
  vi.useRealTimers();
});
