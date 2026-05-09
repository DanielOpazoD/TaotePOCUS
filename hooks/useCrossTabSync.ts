"use client";

// Cross-tab sync via the native `BroadcastChannel` API.
//
// Without this, two tabs of the admin panel held their own copies
// of `favs` / `overrides` / `userCases` in React state, and changes
// in one tab didn't reach the other until a page refresh. The bug
// surfaced when an admin edited a case in one tab, switched to a
// second tab to verify, and saw the pre-edit version.
//
// `BroadcastChannel` ships in every modern browser (Chrome 54+,
// Safari 15.4+, Firefox 38+). When unavailable (very old Safari
// or test runners), the hook degrades to a no-op — same-tab state
// keeps working, only cross-tab loses sync. No fallback behavior
// needed because the page refresh paths still exist.
//
// Channel name namespace: `pocus:` prefix so the postMessage
// traffic doesn't collide with anyone else's BroadcastChannel
// usage on the same origin (Sentry, Clerk, etc. could all open
// channels of their own).

import { useEffect, useRef } from "react";

const CHANNEL_NAME = "pocus:state";

/**
 * Topic identifiers — narrow union so a typo in a publish call is a
 * compile error. Adding a new topic = one literal here.
 */
export type SyncTopic =
  | "favs"
  | "overrides"
  | "user-cases"
  | "categories"
  | "section-visibility"
  | "language";

/**
 * Message envelope. `actorId` is a per-tab random string (set in
 * the hook below). When a tab receives a message with its own
 * actorId, it ignores it — otherwise local state changes that
 * publish would re-fire the listener and the tab would react to
 * its own broadcast (loop or stale data).
 */
interface SyncMessage {
  topic: SyncTopic;
  actorId: string;
}

/**
 * Module-level singleton channel. Multiple hooks call `useCrossTabSync`
 * — they all share one BroadcastChannel rather than opening N. Lazily
 * created on first use so SSR doesn't try to instantiate.
 */
let sharedChannel: BroadcastChannel | null = null;
let sharedActorId: string | null = null;

function ensureChannel(): { channel: BroadcastChannel | null; actorId: string } {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return { channel: null, actorId: "ssr" };
  }
  if (!sharedChannel) {
    sharedChannel = new BroadcastChannel(CHANNEL_NAME);
    // Crypto-quality randomness for the per-tab id so two tabs
    // opening within the same millisecond don't collide. Falls back
    // to Math.random when the API is unavailable (unlikely in any
    // browser that ships BroadcastChannel).
    sharedActorId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  return { channel: sharedChannel, actorId: sharedActorId! };
}

/**
 * Subscribe to a topic. The handler fires when ANOTHER tab
 * publishes on this topic (the same tab's own publishes are
 * filtered by `actorId` so the handler doesn't loop on its own
 * sets). Auto-unsubscribes on unmount.
 *
 * Usage:
 *   const publish = useCrossTabSync("favs", () => {
 *     // Re-read from storage; another tab just changed favs.
 *     setFavs(Store.getFavs(email));
 *   });
 *   // After a local mutation:
 *   publish();
 */
export function useCrossTabSync(topic: SyncTopic, onRemoteChange: () => void): () => void {
  // Stash the latest handler in a ref so the listener doesn't have
  // to re-subscribe every time the consumer's handler identity
  // changes (consumers typically pass an inline arrow).
  const handlerRef = useRef(onRemoteChange);
  handlerRef.current = onRemoteChange;

  useEffect(() => {
    const { channel, actorId } = ensureChannel();
    if (!channel) return;
    const listener = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data;
      if (!msg || msg.topic !== topic) return;
      if (msg.actorId === actorId) return; // self-broadcast — ignore.
      handlerRef.current();
    };
    channel.addEventListener("message", listener);
    return () => channel.removeEventListener("message", listener);
  }, [topic]);

  // Return a publisher bound to the same channel + actorId. The
  // identity is stable per-render (BroadcastChannel + actorId are
  // module singletons) so consumers can pass it as an effect dep
  // without retriggering.
  return () => {
    const { channel, actorId } = ensureChannel();
    if (!channel) return;
    channel.postMessage({ topic, actorId } satisfies SyncMessage);
  };
}

/**
 * Test-only: reset the singleton so each test gets a fresh
 * channel + actorId. Production code never touches this.
 */
export function __resetCrossTabSyncForTests(): void {
  if (sharedChannel) {
    sharedChannel.close();
    sharedChannel = null;
  }
  sharedActorId = null;
}
