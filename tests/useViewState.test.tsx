import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useViewState } from "@/hooks/useViewState";

// Mock Next's navigation hooks. We capture the URL changes the hook
// requests and replay them through `usePathname` / `useSearchParams`
// on the next render — that's the contract this hook depends on.

let currentPathname = "/";
let currentParams = new URLSearchParams();
// `_opts` mirrors Next router's second arg (`{ scroll }`). We accept it
// so the captured call has the right shape for tests that inspect both
// arguments.
const pushSpy = vi.fn((url: string, _opts?: { scroll?: boolean }) => {
  applyUrl(url);
});
const replaceSpy = vi.fn((url: string, _opts?: { scroll?: boolean }) => {
  applyUrl(url);
});

// History API spies. The hot-path optimization in `useViewState`
// uses these directly for same-path filter changes (avoids the RSC
// refetch on every category click).
const historyPushSpy = vi.fn((_state: unknown, _t: string, url: string) => {
  applyUrl(url);
});
const historyReplaceSpy = vi.fn((_state: unknown, _t: string, url: string) => {
  applyUrl(url);
});

function applyUrl(url: string) {
  const [path = "/", search = ""] = url.split("?");
  currentPathname = path;
  currentParams = new URLSearchParams(search);
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    replace: replaceSpy,
  }),
  usePathname: () => currentPathname,
  useSearchParams: () => currentParams,
}));

describe("useViewState", () => {
  beforeEach(() => {
    currentPathname = "/";
    currentParams = new URLSearchParams();
    pushSpy.mockClear();
    replaceSpy.mockClear();
    historyPushSpy.mockClear();
    historyReplaceSpy.mockClear();
    // Re-stub history.* per-test so previous spies can't bleed across.
    Object.defineProperty(window.history, "pushState", {
      configurable: true,
      writable: true,
      value: historyPushSpy,
    });
    Object.defineProperty(window.history, "replaceState", {
      configurable: true,
      writable: true,
      value: historyReplaceSpy,
    });
  });

  it("derives state from / + empty params (atlas default)", () => {
    const { result } = renderHook(() => useViewState());
    expect(result.current.view).toEqual({ kind: "section", section: "atlas" });
    expect(result.current.cat).toBeNull();
    expect(result.current.tags).toEqual([]);
    expect(result.current.query).toBe("");
    expect(result.current.sort).toBe("recent");
    expect(result.current.caso).toBeNull();
  });

  it("derives state from /ecg with filters", () => {
    currentPathname = "/ecg";
    currentParams = new URLSearchParams("cat=cardiac&tags=STEMI&q=infarto");
    const { result } = renderHook(() => useViewState());
    expect(result.current.view).toEqual({ kind: "section", section: "ecg" });
    expect(result.current.cat).toBe("cardiac");
    expect(result.current.tags).toEqual(["STEMI"]);
    expect(result.current.query).toBe("infarto");
  });

  // ─── Same-path patches (hot path) ─────────────────────────────
  // Filter changes on the same pathname use the native History API
  // directly to avoid the RSC refetch that router.replace/push
  // would trigger. This is the optimization that makes category
  // clicks feel instant.

  it("replacePatch on the same path uses history.replaceState (no router refetch)", () => {
    const { result } = renderHook(() => useViewState());
    act(() => {
      result.current.replacePatch({ query: "abdomen" });
    });
    expect(historyReplaceSpy).toHaveBeenCalledTimes(1);
    expect(historyPushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(historyReplaceSpy.mock.calls[0]![2]).toBe("/?q=abdomen");
  });

  it("pushPatch on the same path uses history.pushState (history entry, no refetch)", () => {
    const { result } = renderHook(() => useViewState());
    act(() => {
      result.current.pushPatch({ caso: "c001" });
    });
    expect(historyPushSpy).toHaveBeenCalledTimes(1);
    expect(historyReplaceSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(historyPushSpy.mock.calls[0]![2]).toBe("/?caso=c001");
  });

  it("clearing a filter omits the param entirely (same-path case)", () => {
    currentPathname = "/";
    currentParams = new URLSearchParams("q=foo");
    const { result } = renderHook(() => useViewState());
    act(() => {
      result.current.replacePatch({ query: "" });
    });
    // Empty query should drop the param entirely, leaving a bare path.
    expect(historyReplaceSpy.mock.calls[0]![2]).toBe("/");
  });

  // ─── Path-change patches (router) ─────────────────────────────
  // Section navigation changes the pathname, so it goes through the
  // Next.js router. This branch fetches the new page's RSC payload
  // (correct behaviour — the destination route is different).

  it("changing the view to a different section goes through router.replace", () => {
    const { result } = renderHook(() => useViewState());
    act(() => {
      result.current.replacePatch({ view: { kind: "section", section: "ecg" } });
    });
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(historyReplaceSpy).not.toHaveBeenCalled();
    expect(replaceSpy.mock.calls[0]![0]).toBe("/ecg");
  });

  it("switching to favs/admin uses router.replace with the right path", () => {
    const { result } = renderHook(() => useViewState());
    act(() => {
      result.current.replacePatch({ view: { kind: "favs" } });
    });
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy.mock.calls[0]![0]).toBe("/favoritos");
  });

  it("scroll: false is passed to the router on a path change", () => {
    const { result } = renderHook(() => useViewState());
    act(() => {
      result.current.replacePatch({ view: { kind: "section", section: "ecg" } });
    });
    const opts = replaceSpy.mock.calls[0]![1];
    expect(opts).toEqual({ scroll: false });
  });

  it("patching the view to the SAME section stays on the history fast path", () => {
    // Edge case: someone explicitly patches view to the section
    // they're already on. Path doesn't change → history API.
    currentPathname = "/";
    const { result } = renderHook(() => useViewState());
    act(() => {
      result.current.replacePatch({ view: { kind: "section", section: "atlas" } });
    });
    // "/atlas" actually maps to "/" via viewToPath in this app —
    // either way, same path → history API, not router.
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(historyReplaceSpy).toHaveBeenCalledTimes(1);
  });
});
