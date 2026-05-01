// Tests for `useHiddenSections` — the per-section visibility toggle
// that drives the public nav rails. Contract:
//
//   1. First visit (no localStorage entry) → "cases" is hidden by
//      default. The public nav doesn't link to Casos clínicos.
//   2. Persisted entry survives across mounts (admin un-hide is
//      remembered next visit).
//   3. setHidden(id, true/false) round-trips through storage.
//   4. visibleSections preserves catalog order; unknown ids in a
//      corrupt entry are dropped.
//
// The hook reads localStorage in a useEffect after first render, so
// the assertions wait for the hydration step via `waitFor`.

import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useHiddenSections } from "@/hooks/useHiddenSections";
import { SECTIONS } from "@/lib/data";

const KEY = "hiddenSectionIds";

beforeEach(() => {
  localStorage.clear();
});

describe("useHiddenSections", () => {
  it("hides Casos clínicos by default on first visit", async () => {
    const { result } = renderHook(() => useHiddenSections());
    await waitFor(() => {
      expect(result.current.isHidden("cases")).toBe(true);
    });
    // The other three sections start visible.
    expect(result.current.isHidden("atlas")).toBe(false);
    expect(result.current.isHidden("ecg")).toBe(false);
    expect(result.current.isHidden("info")).toBe(false);
    expect(result.current.visibleSections.map((s) => s.id)).toEqual(["atlas", "ecg", "info"]);
  });

  it("respects a persisted empty list (admin previously un-hid every section)", async () => {
    localStorage.setItem(KEY, JSON.stringify([]));
    const { result } = renderHook(() => useHiddenSections());
    await waitFor(() => {
      // Hydration ran — `cases` is no longer hidden.
      expect(result.current.isHidden("cases")).toBe(false);
    });
    // All four sections are visible, in catalog order.
    expect(result.current.visibleSections.map((s) => s.id)).toEqual(SECTIONS.map((s) => s.id));
  });

  it("setHidden(id, true) hides the section and persists", async () => {
    const { result } = renderHook(() => useHiddenSections());
    await waitFor(() => {
      expect(result.current.isHidden("cases")).toBe(true);
    });
    act(() => {
      result.current.setHidden("ecg", true);
    });
    await waitFor(() => {
      expect(result.current.isHidden("ecg")).toBe(true);
    });
    // Visible list dropped ecg.
    expect(result.current.visibleSections.map((s) => s.id)).toEqual(["atlas", "info"]);
    // Storage written in catalog order.
    expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toEqual(["ecg", "cases"]);
  });

  it("setHidden(id, false) un-hides and persists", async () => {
    const { result } = renderHook(() => useHiddenSections());
    await waitFor(() => {
      expect(result.current.isHidden("cases")).toBe(true);
    });
    act(() => {
      result.current.setHidden("cases", false);
    });
    await waitFor(() => {
      expect(result.current.isHidden("cases")).toBe(false);
    });
    expect(result.current.visibleSections.map((s) => s.id)).toEqual(SECTIONS.map((s) => s.id));
    expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toEqual([]);
  });

  it("drops unknown ids from a corrupt persisted entry", async () => {
    localStorage.setItem(KEY, JSON.stringify(["cases", "garbage", 42, null, "ecg"]));
    const { result } = renderHook(() => useHiddenSections());
    await waitFor(() => {
      // Only the two valid section ids survive.
      expect(result.current.hiddenSections.sort()).toEqual(["cases", "ecg"]);
    });
    expect(result.current.isHidden("cases")).toBe(true);
    expect(result.current.isHidden("ecg")).toBe(true);
    expect(result.current.isHidden("atlas")).toBe(false);
  });

  it("falls back to the default when the persisted entry is invalid JSON", async () => {
    localStorage.setItem(KEY, "not-json{{{");
    const { result } = renderHook(() => useHiddenSections());
    // Deserialize returned undefined → keep the initial value
    // (`["cases"]`). No throw, no crash.
    await waitFor(() => {
      expect(result.current.isHidden("cases")).toBe(true);
    });
  });
});
