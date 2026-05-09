// Schema validators are the safety net at every untrusted-input
// boundary: corpus JSON fetch, localStorage reads, network responses.
// Tests pin the policy: required-field rejection (drops the entry),
// optional-field tolerance (drops just the field, keeps the entry),
// and array-coercion (Array.isArray gates).

import { describe, expect, it, vi } from "vitest";
import { validateCase, validateCorpus, validateFavsList, validateOverrideMap } from "@/lib/schemas";

const baseValid = {
  id: "tw-1",
  section: "atlas",
  title: "Test",
  category: "cardiac",
  tags: ["B-líneas"],
  modality: "POCUS",
  loop: "blines",
  author: "Author",
  role: "Role",
  date: "2026-01-01",
  description: "Body.",
};

describe("validateCase — required-field gate", () => {
  it("accepts a fully-valid case", () => {
    expect(validateCase(baseValid)).toMatchObject({ id: "tw-1", title: "Test" });
  });

  it("rejects entries missing id / title / section / category / tags", () => {
    const fields = ["id", "title", "section", "category", "tags"] as const;
    for (const f of fields) {
      const dropped: Record<string, unknown> = { ...baseValid };
      delete dropped[f];
      expect(validateCase(dropped)).toBeNull();
    }
  });

  it("rejects entries with the wrong type on a required field", () => {
    expect(validateCase({ ...baseValid, tags: "not-an-array" })).toBeNull();
    expect(validateCase({ ...baseValid, id: 123 })).toBeNull();
    expect(validateCase({ ...baseValid, section: "unknown-section" })).toBeNull();
  });

  it("rejects null / undefined / non-objects outright", () => {
    expect(validateCase(null)).toBeNull();
    expect(validateCase(undefined)).toBeNull();
    expect(validateCase(42)).toBeNull();
    expect(validateCase("string")).toBeNull();
    expect(validateCase([])).toBeNull();
  });
});

describe("validateCase — optional fields are sanitized, not rejected", () => {
  it("strips wrong-typed `featured` but keeps the case", () => {
    const c = validateCase({ ...baseValid, featured: "yes" });
    expect(c).not.toBeNull();
    expect(c).not.toHaveProperty("featured");
  });

  it("strips a malformed `media` (missing src) but keeps the case", () => {
    const c = validateCase({ ...baseValid, media: { kind: "video" } });
    expect(c).not.toBeNull();
    expect(c).not.toHaveProperty("media");
  });

  it("strips a wrong-typed `difficulty` but keeps the case", () => {
    const c = validateCase({ ...baseValid, difficulty: "expert" });
    expect(c).not.toBeNull();
    expect(c).not.toHaveProperty("difficulty");
  });

  it("filters bad entries from `mediaExtra` but keeps the array", () => {
    const c = validateCase({
      ...baseValid,
      mediaExtra: [
        { kind: "image", src: "ok.png" },
        { kind: "image" }, // missing src — drop
        "not-an-object", // drop
        { kind: "video", src: "ok.mp4" },
      ],
    });
    expect(c?.mediaExtra).toHaveLength(2);
  });

  it("strips wrong-typed focus sub-fields but keeps the rest", () => {
    const c = validateCase({
      ...baseValid,
      focus: { x: 25, y: "fifty", scale: 1.5 },
    });
    expect(c?.focus).toEqual({ x: 25, scale: 1.5 });
  });
});

describe("validateCorpus", () => {
  it("returns empty + 0 dropped on non-array input", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(validateCorpus("not an array", "test")).toEqual({ cases: [], dropped: 0 });
    expect(validateCorpus({}, "test")).toEqual({ cases: [], dropped: 0 });
    warn.mockRestore();
  });

  it("partitions valid + invalid entries and reports the dropped count", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = validateCorpus(
      [baseValid, { ...baseValid, id: "tw-2" }, { broken: true }, null, baseValid],
      "test",
    );
    expect(result.cases).toHaveLength(3);
    expect(result.dropped).toBe(2);
    warn.mockRestore();
  });
});

describe("validateOverrideMap", () => {
  it("returns empty for non-object input", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(validateOverrideMap("string", "test").overrides).toEqual({});
    expect(validateOverrideMap(null, "test").overrides).toEqual({});
    expect(validateOverrideMap([1, 2, 3], "test").overrides).toEqual({});
    warn.mockRestore();
  });

  it("drops entries that aren't objects, keeps the rest", () => {
    const result = validateOverrideMap(
      {
        "tw-1": { title: "Edited" },
        "tw-2": "not-an-object",
        "tw-3": { reviewed: true },
      },
      "test",
    );
    expect(result.overrides).toHaveProperty("tw-1");
    expect(result.overrides).not.toHaveProperty("tw-2");
    expect(result.overrides).toHaveProperty("tw-3");
    expect(result.dropped).toBe(1);
  });

  it("strips wrong-typed fields within an entry (keeps the entry)", () => {
    const result = validateOverrideMap(
      {
        "tw-1": {
          title: "Edited",
          tags: "should be array",
          reviewed: "yes",
          deletedAt: 123,
        },
      },
      "test",
    );
    expect(result.overrides["tw-1"]).toEqual({ title: "Edited" });
  });

  it("preserves unknown fields (forward-compat)", () => {
    const result = validateOverrideMap(
      { "tw-1": { title: "Edited", futureField: { nested: true } } },
      "test",
    );
    expect(result.overrides["tw-1"]).toMatchObject({
      title: "Edited",
      futureField: { nested: true },
    });
  });

  it("accepts purged tombstones", () => {
    const result = validateOverrideMap({ "tw-1": { purged: true } }, "test");
    expect(result.overrides["tw-1"]).toEqual({ purged: true });
  });
});

describe("validateFavsList", () => {
  it("returns empty for non-array input", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(validateFavsList(null, "test")).toEqual([]);
    expect(validateFavsList("string", "test")).toEqual([]);
    expect(validateFavsList(123, "test")).toEqual([]);
    warn.mockRestore();
  });

  it("drops non-string entries and empty strings", () => {
    expect(validateFavsList(["a", 42, "", null, "b", { id: "c" }, "d"], "test")).toEqual([
      "a",
      "b",
      "d",
    ]);
  });

  it("returns [] for empty array", () => {
    expect(validateFavsList([], "test")).toEqual([]);
  });
});
