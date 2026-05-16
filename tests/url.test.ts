import { describe, expect, it } from "vitest";
import { applyViewPatch, parseViewState, pathToView, viewToPath } from "@/lib/url";

describe("pathToView", () => {
  it.each([
    ["/", { kind: "section", section: "atlas" }],
    ["/ecg", { kind: "section", section: "ecg" }],
    ["/cases", { kind: "section", section: "cases" }],
    ["/info", { kind: "section", section: "info" }],
    ["/favoritos", { kind: "favs" }],
    ["/admin", { kind: "admin" }],
    ["/garbage", { kind: "section", section: "atlas" }], // unknown -> atlas
    ["", { kind: "section", section: "atlas" }],
  ])("maps %s to the right view", (path, expected) => {
    expect(pathToView(path)).toEqual(expected);
  });
});

describe("viewToPath", () => {
  it("emits / for atlas", () => {
    expect(viewToPath({ kind: "section", section: "atlas" })).toBe("/");
  });
  it("emits /<section> for non-atlas sections", () => {
    expect(viewToPath({ kind: "section", section: "ecg" })).toBe("/ecg");
    expect(viewToPath({ kind: "section", section: "cases" })).toBe("/cases");
    expect(viewToPath({ kind: "section", section: "info" })).toBe("/info");
  });
  it("emits /favoritos and /admin", () => {
    expect(viewToPath({ kind: "favs" })).toBe("/favoritos");
    expect(viewToPath({ kind: "admin" })).toBe("/admin");
  });
});

describe("parseViewState", () => {
  it("defaults to atlas section when no params and root path", () => {
    const s = parseViewState("/", new URLSearchParams(""));
    expect(s.view).toEqual({ kind: "section", section: "atlas" });
    expect(s.cat).toBeNull();
    expect(s.tags).toEqual([]);
    expect(s.query).toBe("");
    expect(s.sort).toBe("recent");
    expect(s.difficulty).toEqual([]);
    expect(s.caso).toBeNull();
  });

  it("parses difficulty as a comma-separated allow-list", () => {
    const s = parseViewState("/", new URLSearchParams("difficulty=basic,advanced"));
    expect(s.difficulty).toEqual(["basic", "advanced"]);
  });

  it("drops unknown difficulty tokens (defensive normalize)", () => {
    // Hand-edited URLs / stale links shouldn't poison the filter.
    const s = parseViewState("/", new URLSearchParams("difficulty=basic,foo,advanced"));
    expect(s.difficulty).toEqual(["basic", "advanced"]);
  });

  it("respects the pathname for view", () => {
    expect(parseViewState("/ecg", new URLSearchParams("")).view).toEqual({
      kind: "section",
      section: "ecg",
    });
    expect(parseViewState("/favoritos", new URLSearchParams("")).view).toEqual({ kind: "favs" });
    expect(parseViewState("/admin", new URLSearchParams("")).view).toEqual({ kind: "admin" });
  });

  it("parses tags as a comma-separated list", () => {
    const s = parseViewState("/", new URLSearchParams("tags=Crítico,STEMI"));
    expect(s.tags).toEqual(["Crítico", "STEMI"]);
  });

  it("parses caso and presenting", () => {
    const s = parseViewState("/", new URLSearchParams("caso=c001&present=c002"));
    expect(s.caso).toBe("c001");
    expect(s.presenting).toBe("c002");
  });

  it("falls back to recent for invalid sort", () => {
    expect(parseViewState("/", new URLSearchParams("sort=garbage")).sort).toBe("recent");
  });

  it("parses page as 0-indexed (URL is 1-indexed for human sharing)", () => {
    expect(parseViewState("/", new URLSearchParams("")).page).toBe(0);
    expect(parseViewState("/", new URLSearchParams("page=1")).page).toBe(0);
    expect(parseViewState("/", new URLSearchParams("page=2")).page).toBe(1);
    expect(parseViewState("/", new URLSearchParams("page=11")).page).toBe(10);
  });

  it("falls back to page 0 for invalid / negative page values", () => {
    expect(parseViewState("/", new URLSearchParams("page=garbage")).page).toBe(0);
    expect(parseViewState("/", new URLSearchParams("page=-3")).page).toBe(0);
    expect(parseViewState("/", new URLSearchParams("page=0")).page).toBe(0);
  });
});

describe("applyViewPatch", () => {
  it("removes empty values rather than encoding them", () => {
    const next = applyViewPatch(new URLSearchParams("q=hello"), { query: "" });
    expect(next.toString()).toBe("");
  });

  it("drops cat/tags when the view changes (section-specific filters)", () => {
    const prev = new URLSearchParams("cat=cardiac&tags=Crítico");
    const next = applyViewPatch(prev, { view: { kind: "favs" } });
    expect(next.get("cat")).toBeNull();
    expect(next.get("tags")).toBeNull();
  });

  it("encodes tags as comma-separated", () => {
    const next = applyViewPatch(new URLSearchParams(""), { tags: ["Crítico", "STEMI"] });
    expect(next.get("tags")).toBe("Crítico,STEMI");
  });

  it("treats an empty tag array as 'remove the param'", () => {
    const next = applyViewPatch(new URLSearchParams("tags=a,b"), { tags: [] });
    expect(next.get("tags")).toBeNull();
  });

  it("does not encode the default 'recent' sort", () => {
    const next = applyViewPatch(new URLSearchParams("sort=title"), { sort: "recent" });
    expect(next.get("sort")).toBeNull();
  });

  it("round-trips through parseViewState (filters only)", () => {
    const start = applyViewPatch(new URLSearchParams(""), {
      cat: "cardiac",
      tags: ["STEMI"],
      query: "infarto",
      sort: "title",
      caso: "ecg001",
    });
    const parsed = parseViewState("/ecg", start);
    expect(parsed.view).toEqual({ kind: "section", section: "ecg" });
    expect(parsed.cat).toBe("cardiac");
    expect(parsed.tags).toEqual(["STEMI"]);
    expect(parsed.query).toBe("infarto");
    expect(parsed.sort).toBe("title");
    expect(parsed.caso).toBe("ecg001");
  });

  it("encodes page as 1-indexed (drops the param at page 0)", () => {
    expect(applyViewPatch(new URLSearchParams(""), { page: 0 }).get("page")).toBeNull();
    expect(applyViewPatch(new URLSearchParams(""), { page: 1 }).get("page")).toBe("2");
    expect(applyViewPatch(new URLSearchParams(""), { page: 5 }).get("page")).toBe("6");
  });

  it("auto-clears page when a filter changes (cat / tags / query / sort / view / difficulty)", () => {
    const seed = new URLSearchParams("page=3");
    expect(applyViewPatch(seed, { cat: "lung" }).get("page")).toBeNull();
    expect(applyViewPatch(seed, { tags: ["Crítico"] }).get("page")).toBeNull();
    expect(applyViewPatch(seed, { query: "infarto" }).get("page")).toBeNull();
    expect(applyViewPatch(seed, { sort: "title" }).get("page")).toBeNull();
    expect(applyViewPatch(seed, { view: { kind: "favs" } }).get("page")).toBeNull();
    expect(applyViewPatch(seed, { difficulty: ["basic"] }).get("page")).toBeNull();
  });

  it("encodes difficulty as a comma-separated list; empty drops the param", () => {
    expect(
      applyViewPatch(new URLSearchParams(""), { difficulty: ["basic", "advanced"] }).get(
        "difficulty",
      ),
    ).toBe("basic,advanced");
    expect(
      applyViewPatch(new URLSearchParams("difficulty=basic"), { difficulty: [] }).get("difficulty"),
    ).toBeNull();
  });

  it("KEEPS page when a non-filter patch happens (e.g. just opening a case)", () => {
    const seed = new URLSearchParams("page=3");
    expect(applyViewPatch(seed, { caso: "c001" }).get("page")).toBe("3");
    expect(applyViewPatch(seed, { presenting: "c001" }).get("page")).toBe("3");
  });

  it("respects an EXPLICIT page in a filter patch (deep-link arrival)", () => {
    // Deep-link `/?cat=lung&page=2` — the patch carries both cat
    // and page, so the auto-clear shouldn't fire. This is the
    // "shareable URL with filter + page" case.
    const next = applyViewPatch(new URLSearchParams(""), { cat: "lung", page: 1 });
    expect(next.get("cat")).toBe("lung");
    expect(next.get("page")).toBe("2");
  });
});
