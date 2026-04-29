import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TransitionLink from "@/components/chrome/TransitionLink";

const pushSpy = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("TransitionLink", () => {
  beforeEach(() => {
    pushSpy.mockClear();
  });
  afterEach(() => {
    // @ts-expect-error — restoring after each test.
    delete (document as Document & { startViewTransition?: unknown }).startViewTransition;
  });

  it("renders an <a> with the given href and children", () => {
    render(<TransitionLink href="/cases">Casos</TransitionLink>);
    const link = screen.getByRole("link", { name: "Casos" });
    expect(link.getAttribute("href")).toBe("/cases");
  });

  it("wraps router.push in document.startViewTransition when supported", () => {
    const startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
      };
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      writable: true,
      value: startViewTransition,
    });

    render(<TransitionLink href="/cases">Casos</TransitionLink>);
    fireEvent.click(screen.getByRole("link", { name: "Casos" }));
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledWith("/cases");
  });

  it("falls through to default Next.js navigation when startViewTransition is unavailable", () => {
    // Don't define startViewTransition. The handler should NOT call
    // preventDefault — Next.js's <Link> takes over.
    render(<TransitionLink href="/cases">Casos</TransitionLink>);
    const link = screen.getByRole("link", { name: "Casos" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);
    // Default not prevented → Next handles the navigation natively.
    expect(event.defaultPrevented).toBe(false);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("does not intercept modifier-clicks (cmd/ctrl/shift open in new tab)", () => {
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    render(<TransitionLink href="/cases">Casos</TransitionLink>);
    const link = screen.getByRole("link", { name: "Casos" });
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { shiftKey: true });
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("does not intercept external links", () => {
    const startViewTransition = vi.fn();
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      writable: true,
      value: startViewTransition,
    });
    render(<TransitionLink href="https://example.com">Out</TransitionLink>);
    fireEvent.click(screen.getByRole("link", { name: "Out" }));
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("respects a caller-supplied onClick that preventDefaults", () => {
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    const onClick = vi.fn((e: React.MouseEvent) => e.preventDefault());
    render(
      <TransitionLink href="/cases" onClick={onClick}>
        Casos
      </TransitionLink>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(onClick).toHaveBeenCalled();
    // Caller already prevented default; the wrapper bows out.
    expect(pushSpy).not.toHaveBeenCalled();
  });
});
