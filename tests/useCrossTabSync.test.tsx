// `useCrossTabSync` is the BroadcastChannel bridge between admin
// tabs. The contract:
//
//   - Subscribe receives messages OTHER tabs publish on the topic.
//   - Subscribe ignores its OWN publishes (no echo loop).
//   - Topic isolation: a "favs" subscriber doesn't fire on
//     "overrides" messages.
//   - SSR / no-BroadcastChannel: degrades to no-op.

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { __resetCrossTabSyncForTests, useCrossTabSync } from "@/hooks/useCrossTabSync";

afterEach(() => {
  __resetCrossTabSyncForTests();
  vi.restoreAllMocks();
});

describe("useCrossTabSync", () => {
  it("publishes to the channel; remote tabs (other actorIds) fire the listener", async () => {
    // Tab A subscribes.
    const onA = vi.fn();
    renderHook(() => useCrossTabSync("favs", onA));

    // Simulate a remote tab posting on the same channel name with a
    // DIFFERENT actorId. happy-dom ships BroadcastChannel; messages
    // dispatched on a separate BroadcastChannel instance with the
    // same name ARE delivered to the subscriber.
    const remote = new BroadcastChannel("pocus:state");
    remote.postMessage({ topic: "favs", actorId: "remote-actor-1" });
    remote.close();

    // `BroadcastChannel.postMessage` dispatches asynchronously and
    // the exact tick when the listener fires isn't deterministic
    // (happy-dom + Node event loop varies between local + CI). A
    // single `setTimeout(0)` raced against the message event on
    // slower CI runners — the test was a known flake. `waitFor`
    // retries the assertion until it holds or hits the 1s timeout,
    // which is exactly the semantics we want here.
    await waitFor(() => expect(onA).toHaveBeenCalled());
  });

  it("ignores self-published messages (no echo loop)", async () => {
    const onA = vi.fn();
    const { result } = renderHook(() => useCrossTabSync("favs", onA));

    // The publisher returned from the hook IS the same actorId as
    // the subscriber. Calling it should NOT trigger the local
    // listener — that's the cardinal rule that keeps `setFavs(next)`
    // followed by `publish()` from looping.
    result.current();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(onA).not.toHaveBeenCalled();
  });

  it("filters by topic — overrides published doesn't fire favs subscriber", async () => {
    const onFavs = vi.fn();
    renderHook(() => useCrossTabSync("favs", onFavs));

    const remote = new BroadcastChannel("pocus:state");
    remote.postMessage({ topic: "overrides", actorId: "remote" });
    remote.close();
    await new Promise((r) => setTimeout(r, 0));

    expect(onFavs).not.toHaveBeenCalled();
  });

  it("unmount removes the listener (no leak across renderHook lifetimes)", async () => {
    const onA = vi.fn();
    const { unmount } = renderHook(() => useCrossTabSync("favs", onA));
    unmount();

    const remote = new BroadcastChannel("pocus:state");
    remote.postMessage({ topic: "favs", actorId: "remote" });
    remote.close();
    await new Promise((r) => setTimeout(r, 0));

    expect(onA).not.toHaveBeenCalled();
  });

  it("returns a no-op publisher when BroadcastChannel is unavailable", () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error — deliberate force-undefined to simulate the
    // SSR / very-old-browser branch.
    delete globalThis.BroadcastChannel;
    __resetCrossTabSyncForTests();
    try {
      const onA = vi.fn();
      const { result } = renderHook(() => useCrossTabSync("favs", onA));
      // Calling the returned publisher must not throw even though
      // there's no channel to post on.
      expect(() => result.current()).not.toThrow();
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });
});
