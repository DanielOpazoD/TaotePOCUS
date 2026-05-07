import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useNativeDialog } from "@/hooks/useNativeDialog";

function Subject() {
  const ref = useNativeDialog<HTMLDialogElement>();
  return (
    <dialog ref={ref} data-testid="dialog">
      hello
    </dialog>
  );
}

describe("useNativeDialog", () => {
  beforeEach(() => {
    cleanup();
  });

  it("calls showModal on mount", () => {
    // happy-dom does not implement showModal/close natively on
    // HTMLDialogElement, so we monkey-patch the prototype with
    // tracking stubs before rendering.
    const proto = HTMLDialogElement.prototype as unknown as {
      showModal?: () => void;
      close?: () => void;
      open?: boolean;
    };
    let openState = false;
    let showCalls = 0;
    let closeCalls = 0;
    Object.defineProperty(proto, "open", {
      configurable: true,
      get() {
        return openState;
      },
    });
    proto.showModal = () => {
      showCalls += 1;
      openState = true;
    };
    proto.close = () => {
      closeCalls += 1;
      openState = false;
    };

    const { unmount } = render(<Subject />);
    expect(showCalls).toBe(1);
    expect(closeCalls).toBe(0);

    unmount();
    expect(closeCalls).toBe(1);
  });

  it("does not re-call showModal if the dialog is already open", () => {
    const proto = HTMLDialogElement.prototype as unknown as {
      showModal?: () => void;
      close?: () => void;
      open?: boolean;
    };
    let showCalls = 0;
    Object.defineProperty(proto, "open", {
      configurable: true,
      get() {
        // Pretend the dialog opened by some other path.
        return true;
      },
    });
    proto.showModal = () => {
      showCalls += 1;
    };
    proto.close = () => {
      /* no-op */
    };

    render(<Subject />);
    expect(showCalls).toBe(0);
  });
});
