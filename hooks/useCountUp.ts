"use client";

import { useEffect, useRef, useState } from "react";

interface Options {
  /** Total animation duration in ms. Default 600. */
  duration?: number;
  /** When the element this fraction-visible, animation kicks off. */
  threshold?: number;
}

/**
 * Animate an integer from 0 up to `target` once when the bound element
 * enters the viewport. Mirrors the dashboard counters in Vercel /
 * Linear / Stripe — the value snaps from 0 to the real number with a
 * cubic ease-out, communicating "this responded just for you".
 *
 * Usage:
 *   const { ref, value } = useCountUp(stats.total);
 *   <dd ref={ref}>{value}</dd>
 *
 * Honors `prefers-reduced-motion: reduce` (renders the final value
 * immediately) and falls through to the final value when the
 * IntersectionObserver API is unavailable (older browsers / SSR).
 */
export function useCountUp<T extends HTMLElement = HTMLElement>(
  target: number,
  { duration = 600, threshold = 0.4 }: Options = {},
) {
  const [value, setValue] = useState(0);
  const ref = useRef<T | null>(null);
  // The animation only runs once per mount; if the target changes
  // mid-animation we snap to the new value rather than re-animate.
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (startedRef.current) {
      setValue(target);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setValue(target);
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(target);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            // Cubic ease-out — matches --ease-emphasized's tail.
            const eased = 1 - Math.pow(1 - t, 3);
            setValue(Math.round(target * eased));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, duration, threshold]);

  return { ref, value };
}
