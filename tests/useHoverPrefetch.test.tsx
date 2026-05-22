// Tests for `useHoverPrefetch`. The hook fires a background fetch
// of a case's media after the pointer has been over the card for
// `delayMs` — enough to filter out scroll-by hovers, fast enough to
// land the asset before the user clicks. Pin the timer / dedupe /
// abort contracts here.

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHoverPrefetch, __resetPrefetchCacheForTests } from "@/hooks/useHoverPrefetch";
import type { Media } from "@/lib/types";

const SAMPLE_VIDEO: Media = {
  kind: "video",
  src: "/api/media/test-1.mp4",
};

beforeEach(() => {
  vi.useFakeTimers();
  __resetPrefetchCacheForTests();
  // Spy on global fetch — the hook uses it to warm the HTTP cache.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useHoverPrefetch", () => {
  it("fires fetch after the hover threshold elapses", () => {
    const { result } = renderHook(() => useHoverPrefetch(SAMPLE_VIDEO));
    act(() => {
      result.current.onPointerEnter();
    });
    // Before the threshold — nothing fired yet.
    expect(fetch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(SAMPLE_VIDEO.src);
  });

  it("cancels the pending fetch when the pointer leaves before the threshold", () => {
    const { result } = renderHook(() => useHoverPrefetch(SAMPLE_VIDEO));
    act(() => {
      result.current.onPointerEnter();
      vi.advanceTimersByTime(80);
      result.current.onPointerLeave();
      vi.advanceTimersByTime(200);
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("dedupes — second hover on the same src does not refetch", () => {
    const { result, rerender } = renderHook(() => useHoverPrefetch(SAMPLE_VIDEO));
    act(() => {
      result.current.onPointerEnter();
      vi.advanceTimersByTime(150);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    // Pointer enters again — already cached, should NOT call fetch.
    act(() => {
      result.current.onPointerLeave();
      result.current.onPointerEnter();
      vi.advanceTimersByTime(150);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    rerender();
  });

  it("is a no-op when media is undefined", () => {
    const { result } = renderHook(() => useHoverPrefetch(undefined));
    act(() => {
      result.current.onPointerEnter();
      vi.advanceTimersByTime(500);
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is a no-op when media has no src", () => {
    const { result } = renderHook(() => useHoverPrefetch({ kind: "video", src: "" }));
    act(() => {
      result.current.onPointerEnter();
      vi.advanceTimersByTime(500);
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("respects a custom delay", () => {
    const { result } = renderHook(() => useHoverPrefetch(SAMPLE_VIDEO, 50));
    act(() => {
      result.current.onPointerEnter();
      vi.advanceTimersByTime(40);
    });
    expect(fetch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("clears the timer on unmount so no fetch fires after the card is gone", () => {
    const { result, unmount } = renderHook(() => useHoverPrefetch(SAMPLE_VIDEO));
    act(() => {
      result.current.onPointerEnter();
      vi.advanceTimersByTime(80);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("FIFO-evicts the oldest entry once the 256-URL cap is reached", () => {
    // Walk 257 distinct URLs through the prefetch pipeline. The first
    // one ("seed") gets pushed out when the 257th lands; a fresh hover
    // on "seed" should re-fire fetch (it's no longer in the cache).
    // Every URL in between stays cached and re-hovering them is a no-op.
    const seed: Media = { kind: "video", src: "/api/media/lru-seed.mp4" };
    const { result: seedHook } = renderHook(() => useHoverPrefetch(seed));
    act(() => {
      seedHook.current.onPointerEnter();
      vi.advanceTimersByTime(150);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    // Fill the cache. Render hooks for each URL — the module-scope
    // dedupe map is what we're stressing, not per-hook state.
    for (let i = 0; i < 256; i++) {
      const url = `/api/media/lru-${i}.mp4`;
      const { result } = renderHook(() => useHoverPrefetch({ kind: "video", src: url }));
      act(() => {
        result.current.onPointerEnter();
        vi.advanceTimersByTime(150);
      });
    }
    // 256 new URLs + the original seed = 257 attempts. The seed should
    // have been evicted when URL #255 landed (cap is 256, so the 257th
    // insertion drops the oldest).
    expect(fetch).toHaveBeenCalledTimes(257);

    // Re-hover the seed — since it was evicted, prefetch fires again.
    const { result: seedHook2 } = renderHook(() => useHoverPrefetch(seed));
    act(() => {
      seedHook2.current.onPointerEnter();
      vi.advanceTimersByTime(150);
    });
    expect(fetch).toHaveBeenCalledTimes(258);
  });
});
