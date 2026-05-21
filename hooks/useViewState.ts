"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  applyViewPatch,
  parseViewState,
  viewToPath,
  type ViewPatch,
  type ViewState,
} from "@/lib/url";

/**
 * URL is the source of truth for view state. The pathname determines
 * the view kind (section/favs/admin); search params carry filters and
 * modal IDs.
 *
 * `pushPatch` adds a history entry (used for opening a case modal so
 * the back button closes it). `replacePatch` updates silently for
 * filter changes that should not pollute history.
 */
export function useViewState(): ViewState & {
  pushPatch: (patch: ViewPatch) => void;
  replacePatch: (patch: ViewPatch) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = useMemo(
    () => parseViewState(pathname, new URLSearchParams(params.toString())),
    [pathname, params],
  );

  const apply = useCallback(
    (patch: ViewPatch, mode: "push" | "replace") => {
      const nextSearch = applyViewPatch(new URLSearchParams(params.toString()), patch);
      const path = patch.view !== undefined ? viewToPath(patch.view) : pathname;
      const qs = nextSearch.toString();
      const url = qs ? `${path}?${qs}` : path;

      // Same-path filter updates (category, tags, query, sort, modal
      // id) bypass the Next.js router and use the native History API
      // directly. Reason: `router.replace()` triggers an RSC refetch
      // for the new URL — even when the path is identical and the
      // page is fully client-rendered, Next.js can't know statically
      // that the server doesn't need the new searchParams. The fetch
      // is a 50–200ms network round-trip on every category click,
      // which is exactly the lag the user perceives as "categories
      // load slowly" (vs. section changes that are instant because
      // <Link> prefetches the route).
      //
      // `window.history.pushState/replaceState` is integrated with
      // Next.js App Router's `useSearchParams` / `usePathname`
      // hooks since Next.js 14.1 — the React tree updates reactively
      // without any RSC fetch. Section navigation (different path)
      // still goes through `router.*` so the new page's RSC payload
      // is requested.
      const isSamePath = path === pathname;
      if (isSamePath && typeof window !== "undefined") {
        const doIt = () => {
          if (mode === "push") window.history.pushState(null, "", url);
          else window.history.replaceState(null, "", url);
        };

        // Wrap filter changes in `document.startViewTransition` when
        // the browser supports it. The browser captures the before /
        // after states and crossfades the difference automatically.
        // Categories, tag toggles, query changes, page navigation —
        // they all get a smooth feel-instant transition for free.
        //
        // Modal-only patches (`caso` or `presenting` toggling) are
        // skipped: the modal has its own focus-trap + scale-in
        // animation that fights the View Transitions snapshot
        // (the modal would crossfade with the grid behind it
        // producing a double-fade artifact).
        const isModalOnly =
          (patch.caso !== undefined || patch.presenting !== undefined) &&
          patch.view === undefined &&
          patch.cat === undefined &&
          patch.tags === undefined &&
          patch.query === undefined &&
          patch.sort === undefined &&
          patch.page === undefined;

        // `Document.startViewTransition` is typed natively in lib.dom
        // (TS 5.6+). The optional-chain check handles browsers that
        // haven't shipped the API yet — when absent, the URL update
        // runs without the animation wrap.
        const supportsViewTransition =
          typeof document !== "undefined" && typeof document.startViewTransition === "function";

        if (!isModalOnly && supportsViewTransition) {
          document.startViewTransition(doIt);
        } else {
          doIt();
        }
        return;
      }
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [params, pathname, router],
  );

  const pushPatch = useCallback((patch: ViewPatch) => apply(patch, "push"), [apply]);
  const replacePatch = useCallback((patch: ViewPatch) => apply(patch, "replace"), [apply]);

  return { ...state, pushPatch, replacePatch };
}
