import { describe, it, expect, beforeEach } from "vitest";
import { useEffect, useRef } from "react";
import { act } from "react";
import { render, cleanup } from "@testing-library/react";
import { useScrollProgress } from "@/hooks/useScrollProgress";

// happy-dom doesn't compute layout, so we stub the scroll metrics
// directly. The wrapper attaches a parallel ref so it can patch the
// element's scrollHeight / clientHeight after mount; the hook reads
// those via its own ref attached on the same node.
function Subject({ scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const stub = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = stub.current;
    if (!el) return;
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
    // Re-trigger an initial measurement now that the metrics are stubbed.
    el.dispatchEvent(new Event("scroll"));
  }, [scrollHeight, clientHeight]);
  return (
    <div
      ref={(el) => {
        // Fan out the same node into the hook's ref and our local stub.
        (ref as unknown as { current: HTMLDivElement | null }).current = el;
        stub.current = el;
      }}
      data-testid="scroll-host"
      data-progress={progress}
    />
  );
}

describe("useScrollProgress", () => {
  beforeEach(() => {
    cleanup();
  });

  it("reports 0 on mount before any scroll", () => {
    const { getByTestId } = render(<Subject scrollHeight={1000} clientHeight={500} />);
    expect(getByTestId("scroll-host").getAttribute("data-progress")).toBe("0");
  });

  it("reports 0 when content does not overflow", () => {
    const { getByTestId } = render(<Subject scrollHeight={500} clientHeight={500} />);
    const el = getByTestId("scroll-host");
    Object.defineProperty(el, "scrollTop", { configurable: true, value: 0 });
    el.dispatchEvent(new Event("scroll"));
    expect(el.getAttribute("data-progress")).toBe("0");
  });

  it("reports a fractional value during scroll", () => {
    const { getByTestId } = render(<Subject scrollHeight={1000} clientHeight={500} />);
    const el = getByTestId("scroll-host");
    Object.defineProperty(el, "scrollTop", { configurable: true, value: 250 });
    act(() => {
      el.dispatchEvent(new Event("scroll"));
    });
    // (1000 - 500) max scroll → 250/500 = 0.5
    expect(el.getAttribute("data-progress")).toBe("0.5");
  });

  it("reports 1 at the bottom", () => {
    const { getByTestId } = render(<Subject scrollHeight={1000} clientHeight={500} />);
    const el = getByTestId("scroll-host");
    Object.defineProperty(el, "scrollTop", { configurable: true, value: 500 });
    act(() => {
      el.dispatchEvent(new Event("scroll"));
    });
    expect(el.getAttribute("data-progress")).toBe("1");
  });

  it("clamps over-scroll to [0, 1]", () => {
    const { getByTestId } = render(<Subject scrollHeight={1000} clientHeight={500} />);
    const el = getByTestId("scroll-host");
    Object.defineProperty(el, "scrollTop", { configurable: true, value: 999 });
    act(() => {
      el.dispatchEvent(new Event("scroll"));
    });
    expect(el.getAttribute("data-progress")).toBe("1");

    Object.defineProperty(el, "scrollTop", { configurable: true, value: -50 });
    act(() => {
      el.dispatchEvent(new Event("scroll"));
    });
    expect(el.getAttribute("data-progress")).toBe("0");
  });
});
