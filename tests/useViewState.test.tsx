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

  it("replacePatch calls router.replace, not push", () => {
    const { result } = renderHook(() => useViewState());
    act(() => {
      result.current.replacePatch({ query: "abdomen" });
    });
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy.mock.calls[0]![0]).toBe("/?q=abdomen");
  });

  it("pushPatch calls router.push (adds history entry)", () => {
    const { result } = renderHook(() => useViewState());
    act(() => {
      result.current.pushPatch({ caso: "c001" });
    });
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(pushSpy.mock.calls[0]![0]).toBe("/?caso=c001");
  });

  it("changing the view rewrites the pathname", () => {
    const { result } = renderHook(() => useViewState());
    act(() => {
      result.current.replacePatch({ view: { kind: "section", section: "ecg" } });
    });
    const url = replaceSpy.mock.calls[0]![0]!;
    expect(url).toBe("/ecg");
  });

  it("switching to favs/admin uses the right path", () => {
    const { result } = renderHook(() => useViewState());
    act(() => {
      result.current.replacePatch({ view: { kind: "favs" } });
    });
    expect(replaceSpy.mock.calls[0]![0]).toBe("/favoritos");
  });

  it("clearing a filter omits the param entirely", () => {
    currentPathname = "/";
    currentParams = new URLSearchParams("q=foo");
    const { result } = renderHook(() => useViewState());
    act(() => {
      result.current.replacePatch({ query: "" });
    });
    // Empty query should drop the param entirely, leaving a bare path.
    expect(replaceSpy.mock.calls[0]![0]).toBe("/");
  });

  it("scroll: false is passed to the router", () => {
    const { result } = renderHook(() => useViewState());
    act(() => {
      result.current.replacePatch({ query: "x" });
    });
    const opts = replaceSpy.mock.calls[0]![1];
    expect(opts).toEqual({ scroll: false });
  });
});
