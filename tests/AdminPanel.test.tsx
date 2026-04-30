import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AdminPanel from "@/components/admin/AdminPanel";
import { caseFactory } from "./fixtures";

// CineLoop renders a canvas + RAF; not relevant for tab-switching tests.
vi.mock("../components/cine", () => ({
  __esModule: true,
  CineLoop: () => <div data-testid="cine-loop-stub" />,
}));

// AdminPanel imports BackupPanel which pulls in dbBulkImport. Same
// module-mock strategy as in BackupPanel.test — the action throws
// otherwise (no Netlify runtime in vitest).
vi.mock("@/app/actions/db", () => ({
  dbBulkImport: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  // happy-dom doesn't ship URL.createObjectURL; BackupPanel uses it.
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
  }
});

afterEach(() => {
  localStorage.clear();
});

const baseProps = {
  allCases: [
    caseFactory({ id: "c-1", title: "Caso 1", tags: ["Sin clasificar"] }),
    caseFactory({ id: "c-2", title: "Caso 2", tags: [] }),
  ],
  userCases: [],
  trashedCases: [],
  trashedImports: [],
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onRestore: vi.fn(),
  onPurge: vi.fn(),
  onRestoreImport: vi.fn(),
  onPurgeImport: vi.fn(),
  onNew: vi.fn(),
};

describe("AdminPanel — tab routing", () => {
  it("starts on the 'Mis casos' tab by default", () => {
    render(<AdminPanel {...baseProps} />);
    const mineTab = screen.getByRole("tab", { name: "Mis casos" });
    expect(mineTab.getAttribute("aria-selected")).toBe("true");
    // The mine view shows 'Casos totales' stat.
    expect(screen.getByText(/Casos totales/i)).toBeTruthy();
  });

  it("hides the 'Clasificar' tab when no onPatch is passed", () => {
    render(<AdminPanel {...baseProps} />);
    expect(screen.queryByRole("tab", { name: /Clasificar/i })).toBeNull();
  });

  it("shows the 'Clasificar' tab with an unclassified-count badge when onPatch is passed", () => {
    render(<AdminPanel {...baseProps} onPatch={vi.fn()} />);
    const tab = screen.getByRole("tab", { name: /Clasificar/i });
    expect(tab).toBeTruthy();
    // 1 of the 2 cases has the "Sin clasificar" tag → badge "1".
    expect(tab.textContent).toContain("1");
  });

  it("switches to the Clasificar tab and renders the queue pills", () => {
    render(<AdminPanel {...baseProps} onPatch={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Clasificar/i }));
    // Queue-state pills are inside the ClassifierBoard.
    expect(screen.getByRole("tab", { name: /Sin clasificar/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Sin revisar/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Todos/i })).toBeTruthy();
  });

  it("hides the 'Categorías' tab when the CRUD callbacks aren't all provided", () => {
    render(<AdminPanel {...baseProps} onPatch={vi.fn()} />);
    expect(screen.queryByRole("tab", { name: /Categorías/i })).toBeNull();
  });

  it("shows 'Categorías' when all CRUD callbacks are wired", () => {
    render(
      <AdminPanel
        {...baseProps}
        onPatch={vi.fn()}
        categories={[{ id: "cardiac", label: "Cardíaco" }]}
        categoryCaseCounts={{ cardiac: 10 }}
        onAddCategory={vi.fn()}
        onRenameCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        isCustomCategory={vi.fn(() => false)}
        isCategoryHidden={vi.fn(() => false)}
        onSetCategoryHidden={vi.fn()}
      />,
    );
    expect(screen.getByRole("tab", { name: /Categorías/i })).toBeTruthy();
  });

  it("Backup tab is always present and switches the rendered subtree", () => {
    render(<AdminPanel {...baseProps} />);
    fireEvent.click(screen.getByRole("tab", { name: "Backup" }));
    // Backup heading is unique to the BackupPanel.
    expect(screen.getByRole("heading", { name: "Backup", level: 2 })).toBeTruthy();
    // The Mis casos stat block is no longer rendered.
    expect(screen.queryByText(/Casos totales/i)).toBeNull();
  });
});

describe("AdminPanel — trash flows", () => {
  it("renders the Papelera de importados block when trashedImports has entries", () => {
    const trashed = [
      caseFactory({
        id: "tw-99",
        title: "Caso eliminado",
        deletedAt: "2026-04-29T00:00:00Z",
      }),
    ];
    render(<AdminPanel {...baseProps} trashedImports={trashed} />);
    expect(screen.getByText(/Papelera de importados/i)).toBeTruthy();
    expect(screen.getByText("Caso eliminado")).toBeTruthy();
    // Restore + permanent-delete buttons present.
    expect(screen.getByRole("button", { name: /Restaurar/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Eliminar definitivamente/i })).toBeTruthy();
  });

  it("calls onRestoreImport when Restaurar is clicked", () => {
    const onRestoreImport = vi.fn();
    const c = caseFactory({ id: "tw-7", title: "Test", deletedAt: "2026-01-01T00:00:00Z" });
    render(<AdminPanel {...baseProps} trashedImports={[c]} onRestoreImport={onRestoreImport} />);
    fireEvent.click(screen.getByRole("button", { name: /Restaurar/i }));
    expect(onRestoreImport).toHaveBeenCalledWith(c);
  });

  it("calls onPurgeImport when Eliminar definitivamente is clicked", () => {
    const onPurgeImport = vi.fn();
    const c = caseFactory({ id: "tw-7", title: "Test", deletedAt: "2026-01-01T00:00:00Z" });
    render(<AdminPanel {...baseProps} trashedImports={[c]} onPurgeImport={onPurgeImport} />);
    fireEvent.click(screen.getByRole("button", { name: /Eliminar definitivamente/i }));
    expect(onPurgeImport).toHaveBeenCalledWith(c);
  });
});
