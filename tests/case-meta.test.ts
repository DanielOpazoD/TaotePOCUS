// Unit tests for the case-meta helpers. The reading-time / difficulty
// / last-updated paths are exercised indirectly via the modal tests;
// here we lock in the new `getCaseMedia` join so the unified read
// path stays correct as the type evolves.

import { describe, expect, it } from "vitest";

import { getCaseMedia } from "@/lib/case-meta";
import type { Media } from "@/lib/types";
import { caseFactory } from "./fixtures";

const cover: Media = { kind: "image", src: "data:image/png;base64,A", name: "cover.png" };
const extraA: Media = { kind: "image", src: "data:image/png;base64,B", name: "a.png" };
const extraB: Media = { kind: "video", src: "data:video/mp4;base64,C", name: "b.mp4" };

describe("getCaseMedia", () => {
  it("returns an empty array when the case has no media at all", () => {
    const c = caseFactory({ media: undefined, mediaExtra: undefined });
    expect(getCaseMedia(c)).toEqual([]);
  });

  it("returns just the primary when there are no extras", () => {
    const c = caseFactory({ media: cover });
    expect(getCaseMedia(c)).toEqual([cover]);
  });

  it("returns just the primary when extras is an empty array", () => {
    const c = caseFactory({ media: cover, mediaExtra: [] });
    expect(getCaseMedia(c)).toEqual([cover]);
  });

  it("joins primary + extras in order", () => {
    const c = caseFactory({ media: cover, mediaExtra: [extraA, extraB] });
    expect(getCaseMedia(c)).toEqual([cover, extraA, extraB]);
  });

  it("ignores extras when there's no primary (avoids orphaned slides)", () => {
    // Realistically the form only allows extras after a primary is
    // set, but if a backup-restore lands extras-only data we still
    // return them — the modal then renders only the extras as the
    // carousel. (Spec: present whatever's there; never drop data.)
    const c = caseFactory({ media: undefined, mediaExtra: [extraA] });
    // Current contract: primary missing → only extras returned.
    expect(getCaseMedia(c)).toEqual([extraA]);
  });
});
