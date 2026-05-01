import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CategoriesEditor from "@/components/admin/CategoriesEditor";
import type { Category } from "@/lib/types";

const builtIns: Category[] = [
  { id: "cardiac", label: "Cardíaco" },
  { id: "lung", label: "Pulmonar" },
];
const customs: Category[] = [{ id: "c:peds", label: "Pediatría" }];

// Loose Mock typing — at the call site we'll narrow each one back to
// the exact signature CategoriesEditor expects. Using `Mock` directly
// would force every default factory to declare its return type.
type AnyMock = ReturnType<typeof vi.fn>;

function renderEditor(
  overrides: {
    onAdd?: AnyMock;
    onRename?: AnyMock;
    onRemove?: AnyMock;
    isHidden?: AnyMock;
    setHidden?: AnyMock;
    caseCounts?: Record<string, number>;
  } = {},
) {
  // Mocks resolve their canned values asynchronously to match the
  // post-ADR-0011 contract (the editor's mutation props are now
  // `Promise<…>`). Tests that wait on the next tick (`findByText`,
  // `waitFor`) work transparently; the few that asserted on
  // synchronous side-effects after a fire-and-forget call now use
  // `await act(...)` instead.
  const onAdd = overrides.onAdd ?? vi.fn().mockResolvedValue({ id: "c:new", label: "New" });
  const onRename = overrides.onRename ?? vi.fn().mockResolvedValue(true);
  const onRemove = overrides.onRemove ?? vi.fn().mockResolvedValue(true);
  const isHidden = overrides.isHidden ?? vi.fn().mockReturnValue(false);
  const setHidden = overrides.setHidden ?? vi.fn();
  const caseCounts = overrides.caseCounts ?? { cardiac: 5, "c:peds": 2 };

  // Cast each mock through the narrowed signature the component
  // expects. The mock at runtime is callable with any args; TS just
  // wants the static type to match the prop slot.
  render(
    <CategoriesEditor
      categories={[...builtIns, ...customs]}
      onAdd={onAdd as unknown as (label: string) => Promise<Category | null>}
      onRename={onRename as unknown as (id: string, label: string) => Promise<boolean>}
      onRemove={onRemove as unknown as (id: string) => Promise<boolean>}
      isCustom={(id) => id.startsWith("c:")}
      isHidden={isHidden as unknown as (id: string) => boolean}
      setHidden={setHidden as unknown as (id: string, hidden: boolean) => void}
      caseCounts={caseCounts}
    />,
  );
  return { onAdd, onRename, onRemove, isHidden, setHidden };
}

beforeEach(() => {
  // happy-dom ships no `window.confirm`; the component calls it for
  // the destructive-delete prompt. Stub before each test; individual
  // tests that need a different return override via vi.spyOn().
  Object.defineProperty(window, "confirm", {
    configurable: true,
    writable: true,
    value: vi.fn(() => true),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("CategoriesEditor — listing", () => {
  it("renders both built-in and custom categories with counts", () => {
    renderEditor();
    expect(screen.getByText("Cardíaco")).toBeTruthy();
    expect(screen.getByText("Pulmonar")).toBeTruthy();
    expect(screen.getByText("Pediatría")).toBeTruthy();
    // Counts visible per row
    expect(screen.getByText(/5 casos/)).toBeTruthy();
    expect(screen.getByText(/2 casos/)).toBeTruthy();
  });
});

describe("CategoriesEditor — add", () => {
  it("submits the trimmed label to onAdd and clears the input", async () => {
    // `onAdd` is async post-ADR-0011 follow-up; the component awaits.
    // The test waits for the input to clear, which only happens after
    // the resolved Promise lands.
    const onAdd = vi.fn().mockResolvedValue({ id: "c:trauma", label: "Trauma" });
    renderEditor({ onAdd });

    const input = screen.getByPlaceholderText(/Nueva categoría/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Trauma  " } });
    fireEvent.click(screen.getByRole("button", { name: /Agregar/i }));

    expect(onAdd).toHaveBeenCalledWith("  Trauma  "); // component leaves trim to the hook
    await waitFor(() => expect(input.value).toBe("")); // input cleared on success
  });

  it("shows an error when onAdd resolves null (duplicate / empty / DB rejection)", async () => {
    const onAdd = vi.fn().mockResolvedValue(null);
    renderEditor({ onAdd });

    fireEvent.change(screen.getByPlaceholderText(/Nueva categoría/i), {
      target: { value: "Cardíaco" }, // duplicate
    });
    fireEvent.click(screen.getByRole("button", { name: /Agregar/i }));

    // The error message is set after the awaited onAdd returns null.
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no se pudo crear/i);
  });
});

describe("CategoriesEditor — rename custom", () => {
  it("commits the new label on Enter", () => {
    const onRename = vi.fn().mockReturnValue(true);
    renderEditor({ onRename });

    // Find the rename button on the Pediatría row (icon-btn with edit aria-label)
    const renameBtn = screen.getByRole("button", { name: /Renombrar Pediatría/i });
    fireEvent.click(renameBtn);

    const input = screen.getByLabelText(/Renombrar Pediatría/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Pediátrico" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("c:peds", "Pediátrico");
  });

  it("aborts rename on Escape without calling onRename", () => {
    const onRename = vi.fn();
    renderEditor({ onRename });

    fireEvent.click(screen.getByRole("button", { name: /Renombrar Pediatría/i }));
    const input = screen.getByLabelText(/Renombrar Pediatría/i);
    fireEvent.change(input, { target: { value: "X" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onRename).not.toHaveBeenCalled();
  });
});

describe("CategoriesEditor — remove custom", () => {
  it("requires confirm when the category is in use, then calls onRemove", () => {
    const onRemove = vi.fn().mockReturnValue(true);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor({ onRemove, caseCounts: { "c:peds": 3 } });

    fireEvent.click(screen.getByRole("button", { name: /Eliminar Pediatría/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledWith("c:peds");
  });

  it("skips confirm when the category is unused", () => {
    const onRemove = vi.fn().mockReturnValue(true);
    const confirmSpy = vi.spyOn(window, "confirm");
    renderEditor({ onRemove, caseCounts: {} }); // 0 cases → no confirm

    fireEvent.click(screen.getByRole("button", { name: /Eliminar Pediatría/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledWith("c:peds");
  });

  it("respects user-cancellation of the destructive confirm", () => {
    const onRemove = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditor({ onRemove, caseCounts: { "c:peds": 5 } });

    fireEvent.click(screen.getByRole("button", { name: /Eliminar Pediatría/i }));
    expect(onRemove).not.toHaveBeenCalled();
  });
});

describe("CategoriesEditor — hide / show toggle", () => {
  it("flips visibility for built-in and custom alike", () => {
    const setHidden = vi.fn();
    renderEditor({ setHidden });

    // Built-in: Cardíaco visible by default → click toggles to hidden=true
    const cardiacToggle = screen.getByRole("button", { name: /Ocultar Cardíaco/i });
    fireEvent.click(cardiacToggle);
    expect(setHidden).toHaveBeenLastCalledWith("cardiac", true);

    // Custom: Pediatría visible → click toggles
    const pedsToggle = screen.getByRole("button", { name: /Ocultar Pediatría/i });
    fireEvent.click(pedsToggle);
    expect(setHidden).toHaveBeenLastCalledWith("c:peds", true);
  });

  it("aria-pressed reflects the current visibility state", () => {
    const isHidden = vi.fn((id: string) => id === "lung"); // lung hidden
    renderEditor({ isHidden });

    const cardiacToggle = screen.getByRole("button", { name: /Ocultar Cardíaco/i });
    const lungToggle = screen.getByRole("button", { name: /Mostrar Pulmonar/i });

    expect(cardiacToggle.getAttribute("aria-pressed")).toBe("true"); // visible
    expect(lungToggle.getAttribute("aria-pressed")).toBe("false"); // hidden
  });
});
