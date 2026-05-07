import { describe, it, expect, beforeEach } from "vitest";
import { act } from "react";
import { render, cleanup } from "@testing-library/react";
import { useScrollProgress } from "@/hooks/useScrollProgress";

// Helper component that wires the hook's ref to a scrollable div and
// surfaces the progress value as data-progress for the test to read.
function Subject({ scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (el) {
          // happy-dom doesn't compute layout, so we stub the scroll
          // metrics directly to drive deterministic test scenarios.
          Object.defineProperty(el, "scrollHeight", {
            configurable: true,
            value: scrollHeight,
          });
          Object.defineProperty(el, "clientHeight", {
            configurable: true,
            value: clientHeight,
          });
        }
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
