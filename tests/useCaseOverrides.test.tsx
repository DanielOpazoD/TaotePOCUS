import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { mergeWithOverrides, useCaseOverrides } from "@/hooks/useCaseOverrides";
import { caseFactory } from "./fixtures";

describe("useCaseOverrides", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("starts empty and hydrates after mount", async () => {
    const { result } = renderHook(() => useCaseOverrides());
    expect(result.current.overrides).toEqual({});
    await waitFor(() => expect(result.current.hydrated).toBe(true));
  });

  it("hydrates from localStorage when an override is already persisted", async () => {
    localStorage.setItem(
      "pocus_case_overrides",
      JSON.stringify({ "tw-1": { title: { es: "Persistido" } } }),
    );
    const { result } = renderHook(() => useCaseOverrides());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.overrides).toEqual({ "tw-1": { title: { es: "Persistido" } } });
  });

  it("setOverride writes to localStorage and updates state", async () => {
    const { result } = renderHook(() => useCaseOverrides());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await act(async () => {
      await result.current.setOverride("tw-1", { title: { es: "Nuevo título" } });
    });
    expect(result.current.overrides).toEqual({ "tw-1": { title: { es: "Nuevo título" } } });
    const persisted = JSON.parse(localStorage.getItem("pocus_case_overrides") ?? "{}");
    expect(persisted).toEqual({ "tw-1": { title: { es: "Nuevo título" } } });
  });

  it("setOverride shallow-merges multiple writes for the same id", async () => {
    const { result } = renderHook(() => useCaseOverrides());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await act(async () => {
      await result.current.setOverride("tw-1", { title: { es: "Primera" } });
    });
    await act(async () => {
      await result.current.setOverride("tw-1", { category: "lung" });
    });
    expect(result.current.overrides["tw-1"]).toEqual({
      title: { es: "Primera" },
      category: "lung",
    });
  });

  it("clearOverride drops the entry from state and storage", async () => {
    const { result } = renderHook(() => useCaseOverrides());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await act(async () => {
      await result.current.setOverride("tw-1", { title: { es: "Editado" } });
    });
    await act(async () => {
      await result.current.clearOverride("tw-1");
    });
    expect(result.current.overrides).toEqual({});
    expect(localStorage.getItem("pocus_case_overrides")).toBe("{}");
  });

  it("setOverride drops keys with explicit undefined value", async () => {
    const { result } = renderHook(() => useCaseOverrides());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await act(async () => {
      await result.current.setOverride("tw-1", { title: { es: "X" }, featured: true });
    });
    await act(async () => {
      // Setting `featured: undefined` is the caller's signal for
      // "use the source value" — the key is dropped from the override.
      await result.current.setOverride("tw-1", { featured: undefined });
    });
    // `featured` was removed; `title` survives.
    expect(result.current.overrides["tw-1"]).toEqual({ title: { es: "X" } });
  });
});

describe("mergeWithOverrides", () => {
  it("returns the input list unchanged when there are no overrides", () => {
    const cases = [caseFactory({ id: "c1" }), caseFactory({ id: "c2" })];
    const result = mergeWithOverrides(cases, {});
    // Same reference — cheap short-circuit.
    expect(result).toBe(cases);
  });

  it("applies a patch to the matching case only", () => {
    const cases = [
      caseFactory({ id: "c1", title: "Original 1" }),
      caseFactory({ id: "c2", title: "Original 2" }),
    ];
    const result = mergeWithOverrides(cases, {
      c2: { title: { es: "Editado" } },
    });
    expect(result[0]?.title.es).toBe("Original 1");
    expect(result[1]?.title.es).toBe("Editado");
  });

  it("preserves untouched fields from the source case", () => {
    const original = caseFactory({
      id: "c1",
      title: "T",
      category: "lung",
      tags: ["A"],
      description: "Original description.",
    });
    const result = mergeWithOverrides([original], {
      c1: { title: { es: "Nuevo" } },
    });
    expect(result[0]).toEqual({ ...original, title: { es: "Nuevo" } });
  });

  it("supports overriding multiple fields at once", () => {
    const original = caseFactory({ id: "c1", category: "lung", featured: false });
    const result = mergeWithOverrides([original], {
      c1: { category: "cardiac", featured: true },
    });
    expect(result[0]?.category).toBe("cardiac");
    expect(result[0]?.featured).toBe(true);
  });

  it("ignores override entries for ids that don't exist in the list", () => {
    const cases = [caseFactory({ id: "c1" })];
    const result = mergeWithOverrides(cases, {
      "c-nonexistent": { title: { es: "Nada" } },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("c1");
  });
});
