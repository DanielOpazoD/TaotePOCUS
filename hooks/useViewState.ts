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
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [params, pathname, router],
  );

  const pushPatch = useCallback((patch: ViewPatch) => apply(patch, "push"), [apply]);
  const replacePatch = useCallback((patch: ViewPatch) => apply(patch, "replace"), [apply]);

  return { ...state, pushPatch, replacePatch };
}
