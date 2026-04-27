import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// Minimal harness: a div that hosts the trap with three focusable buttons.
// Verifies the trap moves focus into the container, cycles Tab at the end
// of the focusable list, and reverses on Shift+Tab.

function TrappedDialog() {
  const ref = useFocusTrap<HTMLDivElement>(true);
  return (
    <div ref={ref} role="dialog" data-testid="dialog">
      <button data-testid="first">First</button>
      <button data-testid="middle">Middle</button>
      <button data-testid="last">Last</button>
    </div>
  );
}

describe("useFocusTrap", () => {
  it("moves focus into the container on mount", () => {
    const { getByTestId } = render(<TrappedDialog />);
    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("Tab from the last element wraps to the first", () => {
    const { getByTestId } = render(<TrappedDialog />);
    const last = getByTestId("last");
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(getByTestId("dialog"), { key: "Tab" });
    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("Shift+Tab from the first element wraps to the last", () => {
    const { getByTestId } = render(<TrappedDialog />);
    const first = getByTestId("first");
    first.focus();
    fireEvent.keyDown(getByTestId("dialog"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(getByTestId("last"));
  });

  it("ignores keys other than Tab", () => {
    const { getByTestId } = render(<TrappedDialog />);
    getByTestId("middle").focus();
    fireEvent.keyDown(getByTestId("dialog"), { key: "Escape" });
    // Focus did not move.
    expect(document.activeElement).toBe(getByTestId("middle"));
  });
});
