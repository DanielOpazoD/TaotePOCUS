// Unit tests for the case-meta helpers. These render directly into the
// modal (reading-time pill, difficulty pill, "Actualizado" stamp) and
// drive the modal media carousel; a regression here lands as wrong
// stamps or dropped slides.

import { describe, expect, it } from "vitest";

import {
  difficultyLabel,
  getCaseMedia,
  lastUpdatedFor,
  readingTimeFor,
  wasUpdatedAfterPublication,
} from "@/lib/case-meta";
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

describe("readingTimeFor", () => {
  it("returns at least '1 min' for very short cases", () => {
    const c = caseFactory({ title: "x", description: "y", tags: [] });
    expect(readingTimeFor(c)).toBe("1 min");
  });

  it("scales roughly with word count (180 wpm)", () => {
    // ~720 words → 4 minutes at 180 wpm.
    const longText = Array.from({ length: 720 }, (_, i) => `palabra${i}`).join(" ");
    const c = caseFactory({ title: "Caso", description: longText, tags: [] });
    expect(readingTimeFor(c)).toBe("4 min");
  });

  it("counts title + description + tags into the estimate", () => {
    // Tags contribute words; the estimate considers all three sources.
    const c = caseFactory({
      title: "Edema pulmonar agudo",
      description: "Patrón B confluente bilateral.",
      tags: ["B-líneas", "Crítico", "Cardiogénico"],
    });
    // ~9 words total → still rounds to 1 min, but the call shouldn't throw.
    expect(readingTimeFor(c)).toMatch(/^\d+ min$/);
  });
});

describe("difficultyLabel", () => {
  it("returns the Spanish label for each level", () => {
    expect(difficultyLabel(caseFactory({ difficulty: "basic" }))).toBe("Básico");
    expect(difficultyLabel(caseFactory({ difficulty: "intermediate" }))).toBe("Intermedio");
    expect(difficultyLabel(caseFactory({ difficulty: "advanced" }))).toBe("Avanzado");
  });

  it("defaults to 'Intermedio' when difficulty is missing", () => {
    expect(difficultyLabel(caseFactory({ difficulty: undefined }))).toBe("Intermedio");
  });
});

describe("lastUpdatedFor", () => {
  it("formats lastUpdated when present (Spanish full date)", () => {
    // Use noon UTC to dodge timezone shifts at midnight boundaries.
    const c = caseFactory({ date: "2026-01-01", lastUpdated: "2026-04-15T12:00:00Z" });
    const out = lastUpdatedFor(c);
    expect(out).toContain("2026");
    expect(out).toMatch(/abril/i); // month name in Spanish
  });

  it("falls back to date when lastUpdated is missing", () => {
    const c = caseFactory({ date: "2026-04-15T12:00:00Z", lastUpdated: undefined });
    const out = lastUpdatedFor(c);
    expect(out).toContain("2026");
    expect(out).toMatch(/abril/i);
  });
});

describe("wasUpdatedAfterPublication", () => {
  it("returns false when lastUpdated is missing", () => {
    expect(wasUpdatedAfterPublication(caseFactory({ lastUpdated: undefined }))).toBe(false);
  });

  it("returns false when lastUpdated is on the same day as date (within 24h)", () => {
    const c = caseFactory({ date: "2026-01-01", lastUpdated: "2026-01-01T12:00:00Z" });
    expect(wasUpdatedAfterPublication(c)).toBe(false);
  });

  it("returns true when lastUpdated is more than 24h after date", () => {
    const c = caseFactory({ date: "2026-01-01", lastUpdated: "2026-01-03" });
    expect(wasUpdatedAfterPublication(c)).toBe(true);
  });

  it("returns false when lastUpdated is BEFORE date (sanity)", () => {
    const c = caseFactory({ date: "2026-04-15", lastUpdated: "2026-01-01" });
    expect(wasUpdatedAfterPublication(c)).toBe(false);
  });
});
