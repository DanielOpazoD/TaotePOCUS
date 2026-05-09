import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import BackupPanel from "@/components/admin/BackupPanel";
import { renderWithLanguage as render } from "./test-utils";

// The component imports a Server Action from `@/app/actions/db`. In a
// vitest run there's no Netlify runtime, so calling it would throw.
// We mock the entire module — only `dbBulkImport` is referenced from
// the component, and we want to assert the call arguments anyway.
vi.mock("@/app/actions/db", () => ({
  dbBulkImport: vi.fn(),
}));

// Mock the env flag so we can flip it per-test. Default off (no DB
// section visible); individual tests opt in.
vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return { ...actual, IS_NETLIFY_DB_ENABLED: false };
});

import { dbBulkImport } from "@/app/actions/db";

beforeEach(() => {
  localStorage.clear();
  vi.mocked(dbBulkImport).mockReset();
  // Stub `URL.createObjectURL` — happy-dom doesn't ship it and the
  // export flow uses it to build a download href.
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
  }
});

afterEach(() => {
  localStorage.clear();
});

describe("BackupPanel — preview counts", () => {
  it("renders zeros when storage is empty", () => {
    render(<BackupPanel currentEmail={null} notify={vi.fn()} />);
    // Four buckets, all 0 in fresh state.
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("reclasificaciones")).toBeTruthy();
    expect(screen.getByText("favoritos")).toBeTruthy();
  });

  it("reflects current localStorage state in the preview", () => {
    localStorage.setItem(
      "pocus_case_overrides",
      JSON.stringify({
        a: { category: "lung" },
        b: { reviewed: true },
        c: { deletedAt: "2026-04-29T00:00:00Z" },
      }),
    );
    localStorage.setItem("customCategories", JSON.stringify([{ id: "c:peds", label: "Peds" }]));
    localStorage.setItem("pocus_favs_admin@x", JSON.stringify(["a", "b"]));

    render(<BackupPanel currentEmail="admin@x" notify={vi.fn()} />);

    expect(screen.getByText("3")).toBeTruthy(); // overrides
    expect(screen.getByText("1")).toBeTruthy(); // categories
    expect(screen.getByText("2")).toBeTruthy(); // favorites
  });
});

describe("BackupPanel — staleness banner", () => {
  it("warns when no backup has ever been taken", () => {
    render(<BackupPanel currentEmail={null} notify={vi.fn()} />);
    expect(screen.getByText(/Aún no has hecho un backup/i)).toBeTruthy();
    expect(screen.getByText(/nunca/i)).toBeTruthy();
  });

  it("warns when last backup is older than the staleness threshold", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    localStorage.setItem("pocus_last_backup_at", tenDaysAgo);

    render(<BackupPanel currentEmail={null} notify={vi.fn()} />);
    expect(screen.getByText(/Hace más de \d+ días/i)).toBeTruthy();
  });

  it("does not warn when last backup is recent", () => {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    localStorage.setItem("pocus_last_backup_at", yesterday);

    render(<BackupPanel currentEmail={null} notify={vi.fn()} />);
    expect(screen.queryByText(/Aún no has hecho un backup/i)).toBeNull();
    expect(screen.queryByText(/Hace más de/i)).toBeNull();
    expect(screen.getByText("ayer")).toBeTruthy();
  });
});

describe("BackupPanel — file import", () => {
  it("rejects non-JSON files with a clear error", async () => {
    render(<BackupPanel currentEmail={null} notify={vi.fn()} />);

    // The file input is hidden behind a styled button. Querying by
    // its label exposes it directly without going through the button.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    const garbage = new File(["not json at all"], "trash.json", { type: "application/json" });
    await uploadFile(fileInput!, garbage);

    await waitFor(() => {
      expect(screen.getByText(/El archivo no es JSON válido/i)).toBeTruthy();
    });
  });

  it("rejects a JSON envelope with the wrong version", async () => {
    render(<BackupPanel currentEmail={null} notify={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const wrongVersion = new File([JSON.stringify({ version: 99, data: {} })], "old.json", {
      type: "application/json",
    });
    await uploadFile(fileInput, wrongVersion);

    await waitFor(() => {
      expect(screen.getByText(/no parece un backup válido/i)).toBeTruthy();
    });
  });

  it("stages a valid backup and only writes after explicit confirm", async () => {
    render(<BackupPanel currentEmail={null} notify={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    const valid = new File(
      [
        JSON.stringify({
          version: 1,
          exportedAt: "2026-04-29T12:00:00Z",
          exportedBy: "admin@x",
          summary: { overrides: 1, customCategories: 0, favorites: 0, userCases: 0 },
          data: {
            caseOverrides: { "tw-1": { category: "lung" } },
            customCategories: [],
            favsByEmail: {},
            userCases: [],
          },
        }),
      ],
      "backup.json",
      { type: "application/json" },
    );
    await uploadFile(fileInput, valid);

    // Confirm dialog appears with the exporter info.
    await waitFor(() => {
      expect(screen.getByText(/¿Reemplazar tus datos locales\?/i)).toBeTruthy();
      expect(screen.getByText(/admin@x/)).toBeTruthy();
    });

    // localStorage should NOT yet reflect the bundle's data — the
    // staging is in-memory until confirm.
    expect(localStorage.getItem("pocus_case_overrides")).toBeNull();

    // Cancel the dialog. Storage stays untouched.
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(localStorage.getItem("pocus_case_overrides")).toBeNull();
  });
});

// ─── helper ───────────────────────────────────────────────────────

/**
 * happy-dom's `fireEvent.change` on a file input doesn't fully drive
 * the `onChange` -> `file.text()` chain because `File.text()` returns
 * a real Promise. We set `files` via Object.defineProperty (the only
 * way that bypasses the read-only check on JSDOM-style impls) and
 * then trigger change. The component's handler uses `file.text()`
 * which happy-dom DOES implement correctly — we just need to give it
 * a real `File` blob first.
 */
async function uploadFile(input: HTMLInputElement, file: File): Promise<void> {
  Object.defineProperty(input, "files", {
    value: [file],
    writable: false,
    configurable: true,
  });
  fireEvent.change(input);
  // Give the component's `void handleFilePicked(file)` promise chain
  // a tick to resolve before assertions.
  await new Promise((r) => setTimeout(r, 0));
}
