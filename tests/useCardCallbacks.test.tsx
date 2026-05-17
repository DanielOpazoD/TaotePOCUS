// Tests for `useCardCallbacks` — the stable per-card callback bundle
// the orchestrator forwards to the grid, featured row, and recently-
// viewed rail.
//
// Two reasons this file exists:
//
//   1. **Stable contract.** The four callbacks (`onCardOpen`,
//      `onCardToggleFav`, `onClearFiltersCb`, `onExploreAtlasCb`)
//      have specific input/output shapes the card surfaces depend
//      on. A test pins them so a future refactor that "simplifies"
//      the dispatch breaks here instead of in a hard-to-debug
//      e2e run.
//
//   2. **Regression guard for PR #79.** The modal-open path used
//      to wrap `pushPatch` in `document.startViewTransition()` to
//      morph the clicked thumb into the modal hero. Four targeted
//      flicker fixes (#75–#78) failed to fully eliminate a
//      "catalog row bleeds through the modal" visual bug, so #79
//      reverted to a plain state change. The `does not call
//      document.startViewTransition` assertion below locks that
//      decision in — if anyone re-introduces the wrap (well-
//      intentioned: "the morph was nice!") without re-validating
//      the flicker on real devices, this test fires.
//
// Stability of identity (one render → next) is covered by the
// `React.memo` discipline in `useCallback`-wrapped consumers —
// no need to re-test that here.

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCardCallbacks } from "@/hooks/useCardCallbacks";
import type { CaseRecord, View } from "@/lib/types";

function makeCase(id: string): CaseRecord {
  return {
    id,
    section: "atlas",
    title: { es: id },
    category: "cardiac",
    tags: { es: [] },
    modality: "",
    loop: "blines",
    author: "Admin",
    role: "Admin",
    date: "2026-01-01",
    description: { es: "" },
    featured: false,
  };
}

// Snapshot the document hook so each test sees a fresh surface and
// the regression guard below has somewhere to write a tripwire.
const originalStartFn = (document as unknown as Record<string, unknown>).startViewTransition;

beforeEach(() => {
  delete (document as unknown as Record<string, unknown>).startViewTransition;
});

afterEach(() => {
  if (originalStartFn === undefined) {
    delete (document as unknown as Record<string, unknown>).startViewTransition;
  } else {
    (document as unknown as Record<string, unknown>).startViewTransition = originalStartFn;
  }
  vi.restoreAllMocks();
});

describe("useCardCallbacks", () => {
  describe("onCardOpen", () => {
    it("calls pushPatch with { caso: id } when a case is opened", () => {
      const pushPatch = vi.fn();
      const replacePatch = vi.fn();
      const toggleFav = vi.fn();

      const { result } = renderHook(() => useCardCallbacks({ pushPatch, replacePatch, toggleFav }));

      result.current.onCardOpen(makeCase("case-42"));

      expect(pushPatch).toHaveBeenCalledTimes(1);
      expect(pushPatch).toHaveBeenCalledWith({ caso: "case-42" });
    });

    it("does NOT wrap the state change in document.startViewTransition (PR #79 regression guard)", () => {
      // Tripwire: if anyone re-introduces the View Transitions API
      // wrap on modal-open, this spy catches the call and the
      // test fails loudly. The flicker bug ate four sequential
      // theory-based fixes (#75–#78) — we don't quietly reopen
      // that door.
      const startViewTransition = vi.fn((cb: () => void) => {
        cb();
        return {
          finished: Promise.resolve(),
          ready: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          skipTransition: vi.fn(),
        };
      });
      (document as unknown as Record<string, unknown>).startViewTransition = startViewTransition;

      const pushPatch = vi.fn();
      const { result } = renderHook(() =>
        useCardCallbacks({ pushPatch, replacePatch: vi.fn(), toggleFav: vi.fn() }),
      );

      result.current.onCardOpen(makeCase("case-1"));

      expect(startViewTransition).not.toHaveBeenCalled();
      expect(pushPatch).toHaveBeenCalledWith({ caso: "case-1" });
    });
  });

  describe("onCardToggleFav", () => {
    it("calls toggleFav with the case id", () => {
      const toggleFav = vi.fn();
      const { result } = renderHook(() =>
        useCardCallbacks({ pushPatch: vi.fn(), replacePatch: vi.fn(), toggleFav }),
      );

      result.current.onCardToggleFav(makeCase("xyz"));

      expect(toggleFav).toHaveBeenCalledTimes(1);
      expect(toggleFav).toHaveBeenCalledWith("xyz");
    });
  });

  describe("onClearFiltersCb", () => {
    it("clears category, tags, and query via replacePatch", () => {
      const replacePatch = vi.fn();
      const { result } = renderHook(() =>
        useCardCallbacks({ pushPatch: vi.fn(), replacePatch, toggleFav: vi.fn() }),
      );

      result.current.onClearFiltersCb();

      expect(replacePatch).toHaveBeenCalledTimes(1);
      expect(replacePatch).toHaveBeenCalledWith({ cat: null, tags: [], query: "" });
    });
  });

  describe("onExploreAtlasCb", () => {
    it("navigates to the atlas section via replacePatch", () => {
      const replacePatch = vi.fn();
      const { result } = renderHook(() =>
        useCardCallbacks({ pushPatch: vi.fn(), replacePatch, toggleFav: vi.fn() }),
      );

      result.current.onExploreAtlasCb();

      expect(replacePatch).toHaveBeenCalledTimes(1);
      const patch = replacePatch.mock.calls[0]?.[0] as { view?: View };
      expect(patch.view).toEqual({ kind: "section", section: "atlas" });
    });
  });
});
