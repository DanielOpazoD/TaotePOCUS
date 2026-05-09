// Focused unit tests for `CaseForm`. The component is large; these
// tests pin only the behaviors that have explicit contract value:
//   - Required-field validation (title + description) before submit.
//   - Tag autocomplete vocabulary surfaces via the native
//     `<datalist>`, with the in-use tags filtered out.
//   - The submit handler builds a CaseRecord with the canonical
//     `description` field (post-ADR-0010) and a generated id when
//     the form opened blank.
//
// CineLoop and the Server Action mocks are inherited from
// `tests/setup.ts`. The form's media uploader is exercised
// implicitly via the "no upload, synthetic loop" path since none
// of these tests touch the file input.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CaseForm from "@/components/admin/CaseForm";
import { COMMON_TAGS } from "@/lib/data";
import { adminFactory } from "./fixtures";

vi.mock("../components/cine", () => ({
  __esModule: true,
  CineLoop: () => <div data-testid="cine-loop-stub" />,
}));

describe("CaseForm — tag autocomplete", () => {
  it("surfaces the catalog vocabulary via the datalist (alphabetical)", () => {
    const { container } = render(
      <CaseForm
        initial={null}
        currentUser={adminFactory()}
        tagSuggestions={["B-líneas", "TVP", "Neumotórax"]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // The datalist holds the union of `COMMON_TAGS` + the props,
    // de-duped. Read the option values straight off the DOM —
    // happy-dom doesn't render datalist visually but the elements
    // are queryable.
    const options = Array.from(
      container.querySelectorAll("#case-form-tag-suggestions-es option"),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("B-líneas");
    expect(options).toContain("TVP");
    expect(options).toContain("Neumotórax");
    // COMMON_TAGS contributes its full set too — pick a member
    // that's not also in our overrides above.
    expect(options).toContain(COMMON_TAGS[0]);
    // Sorted ascending (Spanish locale). A < B < C in the locale's
    // collation is enough to verify the sort applied.
    const sorted = [...options].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    expect(options).toEqual(sorted);
  });

  it("hides tags already attached to the case from the suggestions", () => {
    // The form's `addTag` flow appends to `form.tags`. To preselect
    // a tag for this assertion we use the `initial` prop with a
    // pre-populated case.
    // Bilingual fields supplied as the modern shape — the form
    // populates the ES slot from `title.es` / `description.es` /
    // `tags.es`.
    const initial = {
      id: "u_test",
      section: "atlas" as const,
      title: { es: "Test" },
      category: "cardiac",
      tags: { es: ["B-líneas"] },
      modality: "POCUS",
      loop: "blines" as const,
      author: "Tester",
      role: "QA",
      date: "2026-04-26",
      description: { es: "Description text." },
    };
    const { container } = render(
      <CaseForm
        initial={initial}
        currentUser={adminFactory()}
        tagSuggestions={["B-líneas", "TVP", "Neumotórax"]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const options = Array.from(
      container.querySelectorAll("#case-form-tag-suggestions-es option"),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(options).not.toContain("B-líneas");
    expect(options).toContain("TVP");
  });

  it("falls back to COMMON_TAGS when no `tagSuggestions` prop supplied", () => {
    const { container } = render(
      <CaseForm initial={null} currentUser={adminFactory()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    const options = Array.from(
      container.querySelectorAll("#case-form-tag-suggestions-es option"),
    ).map((o) => (o as HTMLOptionElement).value);
    // Every COMMON_TAGS entry is present (vocabulary floor).
    for (const t of COMMON_TAGS) {
      expect(options).toContain(t);
    }
  });
});

describe("CaseForm — submit gate", () => {
  it("requires both title and description before invoking onSave", () => {
    const onSave = vi.fn();
    render(
      <CaseForm initial={null} currentUser={adminFactory()} onSave={onSave} onCancel={vi.fn()} />,
    );
    // Empty form → submit button click does nothing observable.
    fireEvent.click(screen.getByRole("button", { name: /Publicar caso/ }));
    expect(onSave).not.toHaveBeenCalled();
    // The Phase-2 i18n editor splits title / description into bilingual
    // pairs; the gated fields are the Spanish slots ("Título · ES" /
    // "Descripción · ES"). EN is optional and never blocks save.
    fireEvent.change(screen.getByLabelText("Título · ES"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: /Publicar caso/ }));
    expect(onSave).not.toHaveBeenCalled();
    // Both ES slots filled → onSave fires.
    fireEvent.change(screen.getByLabelText("Descripción · ES"), {
      target: { value: "A description that's long enough to be valid." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Publicar caso/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]?.[0] as {
      description: { es: string };
      title: { es: string };
      id: string;
    };
    expect(saved.description.es).toMatch(/long enough to be valid/);
    expect(saved.title.es).toBe("Hello");
    expect(saved.id).toMatch(/^u_/); // generated id for new cases
  });
});
