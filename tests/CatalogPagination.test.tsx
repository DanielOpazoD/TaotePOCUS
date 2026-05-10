// Smoke test for the catalog pagination control. Pins:
//   - Renders nothing when there's only one page (no chrome at that
//     scale).
//   - Summary + indicator copy comes from the i18n dictionary
//     (regression: these strings used to be hardcoded Spanish).
//   - Prev / Next disabled states at the boundaries.
//   - First / Last shortcuts appear only when totalPages > 5.
//
// Note: this project doesn't extend Vitest with `@testing-library/
// jest-dom`, so we assert `.disabled` directly rather than via
// `toBeDisabled()`, and use `container.textContent` for copy that's
// split across `<strong>` siblings.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { CatalogPagination } from "@/components/CatalogPagination";
import { renderWithLanguage as render } from "./test-utils";

describe("CatalogPagination", () => {
  it("renders nothing when totalPages <= 1", () => {
    const { container } = render(
      <CatalogPagination page={0} totalPages={1} total={20} pageSize={30} onPageChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dictionary-driven summary + indicator (ES default)", () => {
    const { container } = render(
      <CatalogPagination page={0} totalPages={3} total={64} pageSize={30} onPageChange={vi.fn()} />,
    );
    // `renderWithLanguage` defaults to lang "es" — assert the Spanish
    // connectors are present. The text is split across `<strong>`
    // siblings so we check the flattened textContent.
    const text = container.textContent ?? "";
    expect(text).toContain("Mostrando");
    expect(text).toContain("Página");
    // First page of 64 items @ 30/page → "Mostrando 1–30 de 64".
    expect(text).toMatch(/Mostrando\s*1\s*–\s*30\s*de\s*64/);
    expect(text).toMatch(/Página\s*1\s*de\s*3/);
  });

  it("disables Prev on the first page and Next on the last", () => {
    const { rerender } = render(
      <CatalogPagination page={0} totalPages={3} total={64} pageSize={30} onPageChange={vi.fn()} />,
    );
    const prev = () => screen.getByRole("button", { name: "Página anterior" }) as HTMLButtonElement;
    const next = () =>
      screen.getByRole("button", { name: "Página siguiente" }) as HTMLButtonElement;
    expect(prev().disabled).toBe(true);
    expect(next().disabled).toBe(false);

    rerender(
      <CatalogPagination page={2} totalPages={3} total={64} pageSize={30} onPageChange={vi.fn()} />,
    );
    expect(prev().disabled).toBe(false);
    expect(next().disabled).toBe(true);
  });

  it("fires onPageChange with the right page on Prev / Next", () => {
    const onPageChange = vi.fn();
    render(
      <CatalogPagination
        page={1}
        totalPages={3}
        total={64}
        pageSize={30}
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Página anterior" }));
    expect(onPageChange).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it("shows First / Last shortcuts only when totalPages > 5", () => {
    const { rerender } = render(
      <CatalogPagination
        page={2}
        totalPages={4}
        total={120}
        pageSize={30}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Primera página" })).toBeNull();

    rerender(
      <CatalogPagination
        page={3}
        totalPages={10}
        total={300}
        pageSize={30}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Primera página" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Última página" })).toBeTruthy();
  });

  it("clamps the end of the range to the actual total on the last page", () => {
    const { container } = render(
      <CatalogPagination
        page={10}
        totalPages={11}
        total={326}
        pageSize={30}
        onPageChange={vi.fn()}
      />,
    );
    // Last page: 30/page × page 10 → start 301, end clamped to 326
    // (not 330). Indicator reads "Página 11 de 11".
    const text = container.textContent ?? "";
    expect(text).toMatch(/Mostrando\s*301\s*–\s*326\s*de\s*326/);
    expect(text).toMatch(/Página\s*11\s*de\s*11/);
  });
});
