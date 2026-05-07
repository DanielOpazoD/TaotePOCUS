import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { useModalShortcuts } from "@/hooks/useModalShortcuts";

describe("useModalShortcuts", () => {
  beforeEach(() => {
    cleanup();
  });

  function setup() {
    const onClose = vi.fn();
    const onFav = vi.fn();
    const onShare = vi.fn();
    const onPresent = vi.fn();
    renderHook(() => useModalShortcuts({ onClose, onFav, onShare, onPresent }));
    return { onClose, onFav, onShare, onPresent };
  }

  it("calls onClose when Escape is pressed", () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onFav for both lowercase f and uppercase F", () => {
    const { onFav } = setup();
    fireEvent.keyDown(window, { key: "f" });
    fireEvent.keyDown(window, { key: "F" });
    expect(onFav).toHaveBeenCalledTimes(2);
  });

  it("calls onShare for s/S", () => {
    const { onShare } = setup();
    fireEvent.keyDown(window, { key: "s" });
    fireEvent.keyDown(window, { key: "S" });
    expect(onShare).toHaveBeenCalledTimes(2);
  });

  it("calls onPresent for p/P", () => {
    const { onPresent } = setup();
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.keyDown(window, { key: "P" });
    expect(onPresent).toHaveBeenCalledTimes(2);
  });

  it("ignores keystrokes from input/textarea/select targets", () => {
    const { onClose, onFav } = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "f" });
    expect(onClose).not.toHaveBeenCalled();
    expect(onFav).not.toHaveBeenCalled();
    document.body.removeChild(input);

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    fireEvent.keyDown(textarea, { key: "f" });
    expect(onFav).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it("ignores keystrokes from contenteditable elements", () => {
    const { onFav } = setup();
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    document.body.appendChild(div);
    fireEvent.keyDown(div, { key: "f" });
    expect(onFav).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });

  it("ignores chorded modifier shortcuts (cmd/ctrl/alt)", () => {
    const { onClose, onFav } = setup();
    fireEvent.keyDown(window, { key: "Escape", metaKey: true });
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    fireEvent.keyDown(window, { key: "s", altKey: true });
    expect(onClose).not.toHaveBeenCalled();
    expect(onFav).not.toHaveBeenCalled();
  });

  it("only requires onClose; optional callbacks are gated", () => {
    const onClose = vi.fn();
    renderHook(() => useModalShortcuts({ onClose }));
    fireEvent.keyDown(window, { key: "f" });
    fireEvent.keyDown(window, { key: "s" });
    fireEvent.keyDown(window, { key: "p" });
    // No optional callbacks were provided, so nothing throws and
    // onClose stays untouched.
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("removes the keydown listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useModalShortcuts({ onClose }));
    unmount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
