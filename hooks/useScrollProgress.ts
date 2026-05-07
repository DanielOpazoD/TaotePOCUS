"use client";

// Track scroll progress (0..1) of a scrollable element.
//
// Used by the case modal to drive the read-progress bar at the top
// of the dialog. The hook returns a stable ref to attach to the
// scrollable element and the current progress value.
//
// Edge cases:
//   - element with no overflow (scrollHeight === clientHeight) →
//     reports 0 instead of dividing by zero.
//   - over-scroll (touch bouncing on iOS, mouse wheel inertia on
//     macOS) → clamped to [0, 1] so the bar never overshoots.
//   - zero-progress on mount (scrollTop is 0 before the first
//     scroll event); we call `update` once synchronously so the
//     bar starts at the correct value if the user landed mid-page
//     (anchor link, restored scroll position).

import { useEffect, useRef, useState } from "react";

export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, []);

  return { ref, progress };
}
