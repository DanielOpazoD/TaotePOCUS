// Tests for `useAIProvider` — registry fetch + localStorage
// persistence + stale-selection fallback. Validates the three
// behaviors a future bug would most plausibly regress:
//   1. The hook reads localStorage on mount and reflects the
//      persisted value once the snapshot lands.
//   2. A persisted id pointing at a no-longer-available provider
//      falls through to the server's `defaultId`.
//   3. `setSelectedId` writes localStorage AND updates state.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAIProvider } from "@/hooks/useAIProvider";

const FETCH_OK = (data: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

const FULL_SNAPSHOT = {
  defaultId: "gemini" as const,
  providers: [
    { id: "gemini", displayName: "Google Gemini", availability: { available: true } },
    {
      id: "openai",
      displayName: "OpenAI",
      availability: { available: false, reason: "OPENAI_API_KEY not set" },
    },
    {
      id: "deepseek",
      displayName: "DeepSeek",
      availability: { available: false, reason: "DEEPSEEK_API_KEY not set" },
    },
    { id: "stub", displayName: "Stub (local · deterministic)", availability: { available: true } },
  ],
};

const STORAGE_KEY = "taote.ai.selectedProvider";

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => FETCH_OK(FULL_SNAPSHOT)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useAIProvider", () => {
  it("starts in loading state and resolves to the server default", async () => {
    const { result } = renderHook(() => useAIProvider());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.snapshot).toEqual(FULL_SNAPSHOT);
    expect(result.current.selectedId).toBe("gemini");
  });

  it("reads localStorage on mount and reflects the persisted choice", async () => {
    window.localStorage.setItem(STORAGE_KEY, "deepseek");
    // Re-mock fetch to return a snapshot where deepseek IS available.
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        FETCH_OK({
          defaultId: "gemini",
          providers: [
            { id: "gemini", displayName: "Google Gemini", availability: { available: true } },
            { id: "deepseek", displayName: "DeepSeek", availability: { available: true } },
            {
              id: "openai",
              displayName: "OpenAI",
              availability: { available: false, reason: "OPENAI_API_KEY not set" },
            },
            { id: "stub", displayName: "Stub", availability: { available: true } },
          ],
        }),
      ),
    );
    const { result } = renderHook(() => useAIProvider());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.selectedId).toBe("deepseek");
  });

  it("falls back to the server default when the persisted id is no longer available", async () => {
    window.localStorage.setItem(STORAGE_KEY, "openai"); // openai is unavailable in FULL_SNAPSHOT
    const { result } = renderHook(() => useAIProvider());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.selectedId).toBe("gemini"); // falls through to defaultId
  });

  it("setSelectedId writes localStorage and updates state", async () => {
    const { result } = renderHook(() => useAIProvider());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setSelectedId("stub");
    });
    await waitFor(() => expect(result.current.selectedId).toBe("stub"));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("stub");
  });

  it("surfaces the error message when /api/admin/ai/providers fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("nope", { status: 403, statusText: "Forbidden" }))),
    );
    const { result } = renderHook(() => useAIProvider());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.snapshot).toBeNull();
    expect(result.current.error).toContain("403");
  });

  it("ignores malformed persisted values (not a known provider id)", async () => {
    window.localStorage.setItem(STORAGE_KEY, "not-a-real-provider");
    const { result } = renderHook(() => useAIProvider());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // The malformed value is rejected by the persistence reader,
    // so the hook falls through to the server default.
    expect(result.current.selectedId).toBe("gemini");
  });
});
