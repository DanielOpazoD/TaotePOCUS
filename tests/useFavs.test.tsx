import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useFavs } from "@/hooks/useFavs";
import { Store } from "@/lib/store";
import type { User } from "@/lib/types";

const sampleUser: User = {
  email: "x@y.z",
  name: "X",
  initials: "X",
  role: "user",
  issuedAt: Date.now(),
  expiresAt: Date.now() + 1_000_000,
};

describe("useFavs", () => {
  it("hydrates with the persisted favorites for the current user", async () => {
    Store.setFavs(sampleUser.email, ["c001", "c002"]);
    const onAnonymous = vi.fn();
    const { result } = renderHook(() => useFavs(sampleUser, true, { onAnonymous }));
    await waitFor(() => expect(result.current.favs).toEqual(["c001", "c002"]));
  });

  it("does not hydrate before `hydrated=true` to avoid clobbering", () => {
    Store.setFavs(sampleUser.email, ["c001"]);
    const onAnonymous = vi.fn();
    const { result } = renderHook(() => useFavs(sampleUser, false, { onAnonymous }));
    expect(result.current.favs).toEqual([]);
  });

  it("toggle adds a new favorite", async () => {
    const onAnonymous = vi.fn();
    const { result } = renderHook(() => useFavs(sampleUser, true, { onAnonymous }));
    await waitFor(() => expect(result.current.favs).toEqual([]));
    await act(async () => {
      await result.current.toggle("c001");
    });
    expect(result.current.favs).toEqual(["c001"]);
    expect(Store.getFavs(sampleUser.email)).toEqual(["c001"]);
  });

  it("toggle removes an existing favorite", async () => {
    Store.setFavs(sampleUser.email, ["c001"]);
    const onAnonymous = vi.fn();
    const { result } = renderHook(() => useFavs(sampleUser, true, { onAnonymous }));
    await waitFor(() => expect(result.current.favs).toEqual(["c001"]));
    await act(async () => {
      await result.current.toggle("c001");
    });
    expect(result.current.favs).toEqual([]);
  });

  it("toggle without a user calls onAnonymous and does not mutate", async () => {
    const onAnonymous = vi.fn();
    const { result } = renderHook(() => useFavs(null, true, { onAnonymous }));
    await waitFor(() => expect(result.current.favs).toEqual([]));
    await act(async () => {
      await result.current.toggle("c001");
    });
    expect(onAnonymous).toHaveBeenCalledTimes(1);
    expect(result.current.favs).toEqual([]);
  });

  it("notifies on storage failure and keeps state unchanged", async () => {
    const onAnonymous = vi.fn();
    const notify = vi.fn();
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("disk gremlin");
    });
    const { result } = renderHook(() => useFavs(sampleUser, true, { onAnonymous, notify }));
    await waitFor(() => expect(result.current.favs).toEqual([]));
    await act(async () => {
      await result.current.toggle("c001");
    });
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/favorito/i));
    expect(result.current.favs).toEqual([]);
    spy.mockRestore();
  });
});
