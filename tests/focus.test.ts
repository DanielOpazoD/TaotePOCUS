// Pin the focus-default resolution chain. The contract:
//
//   per-case override → category default → section default → global → undefined
//
// `resolveFocus` is what `<CaseCard>` calls every render, so an
// off-by-one in the precedence becomes a visible regression on every
// thumbnail. Pinning the order here makes the rule reviewable in
// one diff.

import { describe, expect, it } from "vitest";
import { isDefaultFocus, resolveFocus } from "@/lib/focus";
import type { CaseRecord, FocusDefaults } from "@/lib/types";

/** Minimal `CaseRecord`-like input — the resolver only reads three
 *  fields, so we don't need to construct the full record. */
function caso(
  section: CaseRecord["section"],
  category: string,
  focus?: CaseRecord["focus"],
): Pick<CaseRecord, "section" | "category" | "focus"> {
  return { section, category, focus };
}

describe("resolveFocus", () => {
  it("returns undefined when nothing matches (renderer applies hardcoded defaults)", () => {
    expect(resolveFocus(caso("atlas", "cardiac"), {})).toBeUndefined();
  });

  it("falls through to the global default when no narrower scope matches", () => {
    const defaults: FocusDefaults = { global: { x: 30, y: 40, scale: 1.2 } };
    expect(resolveFocus(caso("atlas", "cardiac"), defaults)).toEqual({
      x: 30,
      y: 40,
      scale: 1.2,
    });
  });

  it("section default beats global", () => {
    const defaults: FocusDefaults = {
      global: { x: 30, y: 40, scale: 1.2 },
      sections: { atlas: { x: 50, y: 50, scale: 1.5 } },
    };
    expect(resolveFocus(caso("atlas", "cardiac"), defaults)).toEqual({
      x: 50,
      y: 50,
      scale: 1.5,
    });
    // Different section → falls back to global.
    expect(resolveFocus(caso("ecg", "cardiac"), defaults)).toEqual({
      x: 30,
      y: 40,
      scale: 1.2,
    });
  });

  it("category default beats section default", () => {
    const defaults: FocusDefaults = {
      sections: { atlas: { scale: 1.5 } },
      categories: { cardiac: { scale: 2 } },
    };
    expect(resolveFocus(caso("atlas", "cardiac"), defaults)).toEqual({ scale: 2 });
    // Different category → falls back to section.
    expect(resolveFocus(caso("atlas", "lung"), defaults)).toEqual({ scale: 1.5 });
  });

  it("per-case override beats every default layer", () => {
    const defaults: FocusDefaults = {
      global: { scale: 1.5 },
      sections: { atlas: { scale: 2 } },
      categories: { cardiac: { scale: 2.5 } },
    };
    expect(resolveFocus(caso("atlas", "cardiac", { x: 10, y: 90 }), defaults)).toEqual({
      x: 10,
      y: 90,
    });
  });

  it("does NOT deep-merge slots — first complete hit wins", () => {
    // Category provides only `scale`; the resolver returns that
    // partial value as-is. The renderer fills missing fields with
    // its hardcoded defaults (50/50), it doesn't inherit from the
    // section's `x/y`. Documented behaviour to keep the chain simple.
    const defaults: FocusDefaults = {
      sections: { atlas: { x: 25, y: 75 } },
      categories: { cardiac: { scale: 2 } },
    };
    expect(resolveFocus(caso("atlas", "cardiac"), defaults)).toEqual({ scale: 2 });
  });

  it("treats an empty slot ({}) as a hit (explicit reset)", () => {
    // Admin sets the category to `{}` to break inheritance from a
    // section/global default — the resolver returns the empty
    // object (the renderer then applies 50/50/1).
    const defaults: FocusDefaults = {
      global: { scale: 2 },
      categories: { cardiac: {} },
    };
    expect(resolveFocus(caso("atlas", "cardiac"), defaults)).toEqual({});
    // Different category → still falls through to global.
    expect(resolveFocus(caso("atlas", "lung"), defaults)).toEqual({ scale: 2 });
  });

  it("ignores unknown category ids and walks the rest of the chain", () => {
    const defaults: FocusDefaults = {
      sections: { atlas: { scale: 1.5 } },
      categories: { cardiac: { scale: 2 } },
    };
    // `does-not-exist` isn't in `categories`, so the resolver falls
    // through to the section default — same behaviour as if the
    // category map were empty.
    expect(resolveFocus(caso("atlas", "does-not-exist"), defaults)).toEqual({ scale: 1.5 });
  });
});

describe("isDefaultFocus", () => {
  it("treats undefined as default", () => {
    expect(isDefaultFocus(undefined)).toBe(true);
  });

  it("treats {} as default (missing fields imply 50/50/1)", () => {
    expect(isDefaultFocus({})).toBe(true);
  });

  it("treats explicit centered + 100% as default", () => {
    expect(isDefaultFocus({ x: 50, y: 50, scale: 1 })).toBe(true);
  });

  it("flags any deviation as non-default", () => {
    expect(isDefaultFocus({ x: 51 })).toBe(false);
    expect(isDefaultFocus({ scale: 1.5 })).toBe(false);
    expect(isDefaultFocus({ y: 0 })).toBe(false);
  });
});
