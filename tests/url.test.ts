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
    expect(s.caso).toBeNull();
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
});
