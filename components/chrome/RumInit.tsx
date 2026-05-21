"use client";

// Tiny zero-render client component. Sole job: subscribe the
// browser to the web-vitals events as soon as the layout mounts.
// Lives at the layout level (`app/layout.tsx`) so RUM data is
// captured for every route, including `/admin` and any future
// public sub-routes.
//
// Why a component (and not a one-liner in layout.tsx): the layout
// is a Server Component by default, and `initRum()` reads
// `window` / `navigator` / dispatches client-only event listeners
// — wrapping the call in a "use client" component is the
// idiomatic Next 13+ way to opt-in to browser execution without
// turning the entire layout into a client component.
//
// The component renders `null` — there's no DOM contribution; the
// effect is the whole point.

import { useEffect } from "react";
import { initRum } from "@/lib/rum";

export function RumInit() {
  useEffect(() => {
    initRum();
    // Empty deps: we initialise exactly once per page lifecycle.
    // The web-vitals library itself handles its event listeners
    // and de-dupes across re-subscriptions, but skipping the
    // function call entirely is cleaner.
  }, []);
  return null;
}
