// Unit tests for `usePreferences`. The hook is the source of truth
// for per-device prefs (autoplay, density, reducedMotion override)
// shipping in `SettingsPanel`. These tests pin:
//
//   - the defaults when localStorage is empty / corrupt,
//   - the shape validation (one bad field → only that field
//     falls back; others survive),
//   - read-modify-write of single keys via `setPreference`,
//   - cross-tab `storage` event subscription,
//   - same-tab custom event subscription.

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  readPreferences,
  usePreferences,
  writePreferences,
} from "@/hooks/usePreferences";
import { STORAGE_KEYS } from "@/lib/storage-keys";

describe("usePreferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults when localStorage is empty", () => {
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("returns defaults when localStorage has malformed JSON", () => {
    window.localStorage.setItem(STORAGE_KEYS.preferences, "{not json");
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("falls back PER-FIELD when one entry is wrong type — others survive", () => {
    window.localStorage.setItem(
      STORAGE_KEYS.preferences,
      JSON.stringify({
        autoplay: "true", // wrong type — should fall back to default false
        density: "compact", // valid → kept
        reducedMotion: "weird", // unknown enum — should fall back to "auto"
      }),
    );
    const prefs = readPreferences();
    expect(prefs.autoplay).toBe(false);
    expect(prefs.density).toBe("compact");
    expect(prefs.reducedMotion).toBe("auto");
  });

  it("setPreference writes the partial change without clobbering siblings", () => {
    writePreferences({
      autoplay: false,
      density: "comfortable",
      reducedMotion: "auto",
    });
    const { result } = renderHook(() => usePreferences());
    act(() => {
      result.current.setPreference("density", "compact");
    });
    expect(result.current.prefs.density).toBe("compact");
    // Persisted blob should retain the other two fields.
    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.preferences) ?? "{}");
    expect(persisted).toEqual({
      autoplay: false,
      density: "compact",
      reducedMotion: "auto",
    });
  });

  it("hydrates from localStorage on first render (after useEffect runs)", () => {
    writePreferences({
      autoplay: true,
      density: "compact",
      reducedMotion: "always",
    });
    const { result } = renderHook(() => usePreferences());
    // The hook's initial state is the defaults; the effect reconciles
    // immediately on mount — `act`/`renderHook` runs effects.
    expect(result.current.prefs.autoplay).toBe(true);
    expect(result.current.prefs.density).toBe("compact");
    expect(result.current.prefs.reducedMotion).toBe("always");
  });

  it("listens to the cross-tab `storage` event", () => {
    const { result } = renderHook(() => usePreferences());
    // Simulate another tab writing a new value.
    act(() => {
      window.localStorage.setItem(
        STORAGE_KEYS.preferences,
        JSON.stringify({
          autoplay: true,
          density: "comfortable",
          reducedMotion: "auto",
        }),
      );
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEYS.preferences,
          newValue: window.localStorage.getItem(STORAGE_KEYS.preferences),
        }),
      );
    });
    expect(result.current.prefs.autoplay).toBe(true);
  });

  it("listens to the same-tab custom event (used by setPreference)", () => {
    const { result } = renderHook(() => usePreferences());
    // Mount a second consumer; verify the first sees a change made
    // via `writePreferences` (which dispatches the custom event).
    act(() => {
      writePreferences({
        autoplay: false,
        density: "compact",
        reducedMotion: "always",
      });
    });
    expect(result.current.prefs.density).toBe("compact");
    expect(result.current.prefs.reducedMotion).toBe("always");
  });
});
