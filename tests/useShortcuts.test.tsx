// Tests for the keyboard-nav additions to `useShortcuts`. The hook
// itself is mostly side-effects (window listeners), so we render a
// host component that mounts the hook and seeds the DOM with
// fake `.case-card` elements positioned by their inline style. The
// row-jump math (↓/↑ jumping a column count) reads
// `getBoundingClientRect().top` to compute the column count, which
// happy-dom honors for elements with explicit `top`.
//
// Linear navigation (j / ←/→) was the pre-existing shape — these
// tests pin both the row-aware additions and the linear behavior so
// future refactors can't regress either.

import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useShortcuts } from "@/hooks/useShortcuts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function Host() {
  useShortcuts({ onHelp: () => {} });
  return null;
}

// Render N cards as `.case-card`, then stub `getBoundingClientRect`
// per-card so the hook's column-count detection (which reads `top`)
// has something to work with. happy-dom does not lay elements out
// from inline CSS, so we have to provide the rect ourselves.
function seedGrid(count: number, cols = 5) {
  // Clear any cards from a previous test in the same DOM.
  document.querySelectorAll(".case-card").forEach((n) => n.remove());
  const CELL = 212; // 200 px + 12 px gutter, but only the ratio matters.
  for (let i = 0; i < count; i++) {
    const el = document.createElement("button");
    el.className = "case-card";
    el.setAttribute("data-card", String(i));
    const x = (i % cols) * CELL;
    const y = Math.floor(i / cols) * CELL;
    el.getBoundingClientRect = () =>
      ({
        x,
        y,
        left: x,
        top: y,
        right: x + 200,
        bottom: y + 200,
        width: 200,
        height: 200,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(el);
  }
}

function activeIdx(): number {
  const a = document.activeElement as HTMLElement | null;
  if (!a || !a.classList.contains("case-card")) return -1;
  return Number(a.dataset.card);
}

beforeEach(() => {
  render(<Host />);
});

afterEach(() => {
  document.querySelectorAll(".case-card").forEach((n) => n.remove());
});

describe("useShortcuts — keyboard nav over the grid", () => {
  it("j with no card focused seeds focus on the first card", () => {
    seedGrid(10);
    fireEvent.keyDown(window, { key: "j" });
    expect(activeIdx()).toBe(0);
  });

  it("k with no card focused seeds focus on the last card", () => {
    seedGrid(10);
    fireEvent.keyDown(window, { key: "k" });
    expect(activeIdx()).toBe(9);
  });

  it("j moves to the next card linearly", () => {
    seedGrid(10);
    fireEvent.keyDown(window, { key: "j" });
    expect(activeIdx()).toBe(0);
    fireEvent.keyDown(window, { key: "j" });
    expect(activeIdx()).toBe(1);
    fireEvent.keyDown(window, { key: "j" });
    expect(activeIdx()).toBe(2);
  });

  it("ArrowRight is an alias for j; ArrowLeft for k", () => {
    seedGrid(10);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(activeIdx()).toBe(0);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(activeIdx()).toBe(1);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(activeIdx()).toBe(0);
  });

  it("ArrowDown jumps a full row in the grid (5 cols)", () => {
    seedGrid(15, 5); // 3 rows × 5 cols
    // Seed focus on card 2 (row 1, col 2).
    (document.querySelector('[data-card="2"]') as HTMLElement).focus();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    // Same column, next row → index 7.
    expect(activeIdx()).toBe(7);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(activeIdx()).toBe(12); // row 3, col 2
  });

  it("ArrowUp is the inverse of ArrowDown", () => {
    seedGrid(15, 5);
    (document.querySelector('[data-card="12"]') as HTMLElement).focus();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(activeIdx()).toBe(7);
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(activeIdx()).toBe(2);
  });

  it("ArrowDown from the last row clamps instead of wrapping", () => {
    seedGrid(13, 5); // 3 rows; row 3 is partial (10, 11, 12).
    (document.querySelector('[data-card="7"]') as HTMLElement).focus();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    // Column 2 of row 3 = card 12. That's the last card; clamp.
    expect(activeIdx()).toBe(12);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(activeIdx()).toBe(12); // already at the end
  });

  it("Home / End jump to first / last", () => {
    seedGrid(10);
    (document.querySelector('[data-card="5"]') as HTMLElement).focus();
    fireEvent.keyDown(window, { key: "Home" });
    expect(activeIdx()).toBe(0);
    fireEvent.keyDown(window, { key: "End" });
    expect(activeIdx()).toBe(9);
  });

  it("does nothing when the grid is empty", () => {
    document.querySelectorAll(".case-card").forEach((n) => n.remove());
    fireEvent.keyDown(window, { key: "j" });
    expect(activeIdx()).toBe(-1);
  });

  it("ignores nav keys while typing in an input", () => {
    seedGrid(5);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "j" });
    // Focus stays on the input.
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
