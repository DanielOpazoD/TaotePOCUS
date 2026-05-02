"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the browser's online/offline state via the standard
 * `navigator.onLine` API + `online` / `offline` window events.
 *
 * Notes on accuracy:
 *   - `navigator.onLine` reports network adapter state, not actual
 *     reachability of remote hosts. A user on a captive-portal Wi-Fi
 *     looks "online" even when the internet is unreachable.
 *   - For our purposes (showing a banner + letting the SW serve
 *     cached pages) the false-positive rate is acceptable. Real
 *     fetch failures fall through to the SW's network rules.
 *
 * SSR: returns `true` on first render so server-rendered HTML
 * doesn't show the offline chrome by default. The actual value
 * resolves on mount.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return online;
}
