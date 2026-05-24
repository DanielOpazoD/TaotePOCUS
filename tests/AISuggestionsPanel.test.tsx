// Integration test for the AI suggestions panel. Exercises the
// full flow: provider selector renders, translate button runs a
// stub `/api/admin/ai/translate` round-trip, diff appears, apply
// commits via the `update` callback with `translationMeta` set.
//
// Note: rendering the AI panel pulls in the i18n-using
// `AIProviderSelector` indirectly; we use `renderWithLanguage`
// so any future addition of `useT()` to the panel doesn't break
// this suite.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithLanguage as render } from "./test-utils";
import { AISuggestionsPanel } from "@/components/admin/ai/AISuggestionsPanel";
import { caseFactory } from "./fixtures";

const SNAPSHOT = {
  defaultId: "stub" as const,
  providers: [
    {
      id: "gemini",
      displayName: "Google Gemini",
      availability: { available: false, reason: "GEMINI_API_KEY not set" },
    },
    { id: "stub", displayName: "Stub (local · deterministic)", availability: { available: true } },
  ],
};

const TRANSLATE_RESPONSE = {
  result: {
    title: "[stub ES→EN] Insuficiencia cardíaca",
    description: "[stub ES→EN] Disnea con B-líneas bilaterales.",
    tags: ["en:B-líneas", "en:ICC"],
  },
  meta: {
    provider: "stub",
    model: "stub-deterministic-v1",
    promptTokens: null,
    completionTokens: null,
    durationMs: 12,
  },
};

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL, init?: RequestInit) =>
      handler(typeof url === "string" ? url : url.toString(), init),
    ),
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AISuggestionsPanel", () => {
  it("renders the provider selector + translate buttons once the registry loads", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/admin/ai/providers")) {
        return Promise.resolve(new Response(JSON.stringify(SNAPSHOT), { status: 200 }));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const caso = caseFactory({
      title: "Insuficiencia cardíaca",
      description: "Disnea con B-líneas.",
      tags: ["B-líneas"],
    });
    render(<AISuggestionsPanel form={caso} update={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Translate ES → EN/ })).toBeTruthy(),
    );
    // The selector lists both providers; gemini option is rendered
    // but disabled (the `<select>` shows it greyed via the
    // `disabled` attribute on the option).
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("stub");
  });

  // Known-flake (May-2026): the `getByRole("textbox")` query has
  // intermittently raced a happy-dom re-render in CI (~1 in 12
  // runs). Vitest `retry(2)` gives it three attempts before
  // failing — preserves coverage without flooding CI with reruns.
  // The underlying timing race is in happy-dom's async render
  // pipeline, not in our component logic, so the retry is the
  // pragmatic fix until happy-dom upstream stabilizes.
  // See `docs/test-flake-policy.md` for the broader rules.
  it(
    "calls the translate endpoint, displays diff, and applies the suggestion",
    { retry: 2 },
    async () => {
      mockFetch((url, init) => {
        if (url.endsWith("/api/admin/ai/providers")) {
          return Promise.resolve(new Response(JSON.stringify(SNAPSHOT), { status: 200 }));
        }
        if (url.endsWith("/api/admin/ai/translate")) {
          const body = JSON.parse(String(init?.body));
          expect(body.provider).toBe("stub");
          expect(body.direction).toBe("es-to-en");
          return Promise.resolve(new Response(JSON.stringify(TRANSLATE_RESPONSE), { status: 200 }));
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      const update = vi.fn();
      const caso = caseFactory({
        title: "Insuficiencia cardíaca",
        description: "Disnea con B-líneas bilaterales.",
        tags: ["B-líneas", "ICC"],
      });
      render(<AISuggestionsPanel form={caso} update={update} />);

      // Wait for selector ready, then fire translate.
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Translate ES → EN/ })).toBeTruthy(),
      );
      fireEvent.click(screen.getByRole("button", { name: /Translate ES → EN/ }));

      // Diff should appear once the stub response lands.
      await waitFor(() => {
        const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
        const titleInput = inputs.find((el) => el.value === "[stub ES→EN] Insuficiencia cardíaca");
        expect(titleInput).toBeTruthy();
      });

      fireEvent.click(screen.getByRole("button", { name: /Apply suggestion/ }));

      // The form's update callback should have been called with the
      // EN slots populated AND `translationMeta` stamped.
      expect(update).toHaveBeenCalledTimes(1);
      const patch = update.mock.calls[0]![0];
      expect(patch.title.en).toBe("[stub ES→EN] Insuficiencia cardíaca");
      expect(patch.description.en).toBe("[stub ES→EN] Disnea con B-líneas bilaterales.");
      expect(patch.tags.en).toEqual(["en:B-líneas", "en:ICC"]);
      expect(patch.translationMeta.aiGenerated).toBe(true);
      expect(patch.translationMeta.provider).toBe("stub");
      expect(patch.translationMeta.reviewedAt).toBeUndefined();
    },
  );

  it("surfaces the route handler's error message when translation fails", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/admin/ai/providers")) {
        return Promise.resolve(new Response(JSON.stringify(SNAPSHOT), { status: 200 }));
      }
      if (url.endsWith("/api/admin/ai/translate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: "Provider unavailable", reason: "GEMINI_API_KEY not set" }),
            { status: 503 },
          ),
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const caso = caseFactory({
      title: "Insuficiencia cardíaca",
      description: "Disnea con B-líneas.",
      tags: [],
    });
    render(<AISuggestionsPanel form={caso} update={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Translate ES → EN/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Translate ES → EN/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("GEMINI_API_KEY");
    });
  });

  it("rejects ES → EN when the ES slot is empty (no useless round-trip)", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/admin/ai/providers")) {
        return Promise.resolve(new Response(JSON.stringify(SNAPSHOT), { status: 200 }));
      }
      throw new Error(`Should not call translate when source is empty: ${url}`);
    });
    const caso = caseFactory({ title: "", description: "", tags: [] });
    render(<AISuggestionsPanel form={caso} update={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Translate ES → EN/ })).toBeTruthy(),
    );
    const btn = screen.getByRole("button", { name: /Translate ES → EN/ }) as HTMLButtonElement;
    // Empty ES → button disabled. Pre-emptive guard at the UI tier
    // mirrors the route handler's validation.
    expect(btn.disabled).toBe(true);
  });

  it("discard clears the suggestion without committing", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/admin/ai/providers")) {
        return Promise.resolve(new Response(JSON.stringify(SNAPSHOT), { status: 200 }));
      }
      if (url.endsWith("/api/admin/ai/translate")) {
        return Promise.resolve(new Response(JSON.stringify(TRANSLATE_RESPONSE), { status: 200 }));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const update = vi.fn();
    const caso = caseFactory({
      title: "X",
      description: "Y.",
      tags: [],
    });
    render(<AISuggestionsPanel form={caso} update={update} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Translate ES → EN/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Translate ES → EN/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Discard/ })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Discard/ }));
    expect(update).not.toHaveBeenCalled();
    // Diff disappears; only the action buttons remain.
    expect(screen.queryByRole("button", { name: /Apply suggestion/ })).toBeNull();
  });
});
