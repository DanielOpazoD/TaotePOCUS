"use client";

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

type Props = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children?: ReactNode;
  };

/**
 * Drop-in replacement for `next/link` that wraps internal navigations
 * in `document.startViewTransition()` so the browser smoothly morphs
 * elements with matching `view-transition-name` between routes.
 *
 * - External links, modifier-clicks (cmd/ctrl/shift), middle-click,
 *   and `target="_blank"` fall through to the default behavior — we
 *   never block opening a link in a new tab.
 * - Browsers without the View Transitions API (Firefox today) get the
 *   normal Next.js client navigation. The `view-transition-name` CSS
 *   rules that drive the morph are also wrapped in `@supports` so
 *   they're a no-op there.
 * - Prefetch behavior is preserved because we still render `<Link>`
 *   underneath; we only intercept the click.
 */
export default function TransitionLink({ onClick, children, ...rest }: Props) {
  const router = useRouter();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Defer to a caller-supplied handler first; if it preventDefault'd
    // we bow out — the caller knows what it's doing.
    onClick?.(e);
    if (e.defaultPrevented) return;

    // Modifier-clicks open in new tab / window — leave them alone.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    // No View Transitions API (Firefox, older Safari) → fall through.
    if (typeof document === "undefined" || typeof document.startViewTransition !== "function") {
      return;
    }

    const href =
      typeof rest.href === "string"
        ? rest.href
        : rest.href && "pathname" in rest.href
          ? (rest.href.pathname ?? "")
          : "";
    if (!href) return;

    // External / hash / mailto / tel — let the browser handle it.
    if (/^(https?:|mailto:|tel:|#)/.test(href)) return;

    e.preventDefault();
    document.startViewTransition(() => {
      router.push(href);
    });
  };

  return (
    <Link {...rest} onClick={handleClick}>
      {children}
    </Link>
  );
}
