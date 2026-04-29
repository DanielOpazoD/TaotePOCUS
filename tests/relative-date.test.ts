import { describe, expect, it } from "vitest";
import { absoluteDate, relativeDate, shortDayMonth } from "@/lib/relative-date";

// Anchor every test on a fixed "now" so the relative phrasing is
// deterministic. We pick a Sunday so weekday math doesn't surprise.
const NOW = new Date(2026, 3, 28); // 28 abr 2026 (month is 0-indexed)

describe("relativeDate", () => {
  it("returns 'hoy' for the same calendar day", () => {
    expect(relativeDate("2026-04-28", NOW)).toBe("hoy");
  });

  it("returns 'ayer' for one day prior", () => {
    expect(relativeDate("2026-04-27", NOW)).toBe("ayer");
  });

  it("returns 'hace N días' for 2-6 days prior", () => {
    expect(relativeDate("2026-04-26", NOW)).toBe("hace 2 días");
    expect(relativeDate("2026-04-22", NOW)).toBe("hace 6 días");
  });

  it("returns 'hace 1 semana' for 7-13 days prior", () => {
    expect(relativeDate("2026-04-21", NOW)).toBe("hace 1 semana");
    expect(relativeDate("2026-04-15", NOW)).toBe("hace 1 semana");
  });

  it("returns 'hace N semanas' for 14-27 days prior", () => {
    expect(relativeDate("2026-04-14", NOW)).toBe("hace 2 semanas");
    expect(relativeDate("2026-04-01", NOW)).toBe("hace 3 semanas");
  });

  it("returns 'hace 1 mes' for 28-59 days prior", () => {
    expect(relativeDate("2026-03-25", NOW)).toBe("hace 1 mes");
    expect(relativeDate("2026-03-01", NOW)).toBe("hace 1 mes");
  });

  it("falls back to absolute for >= ~60 days prior", () => {
    // ~2 months out — the relative phrasing gets awkward, so we
    // anchor with the calendar instead.
    expect(relativeDate("2026-02-15", NOW)).toBe("15 feb 2026");
    expect(relativeDate("2025-04-01", NOW)).toBe("1 abr 2025");
  });

  it("falls back to absolute for future dates", () => {
    // "hace -3 días" would be ridiculous; we render the calendar.
    expect(relativeDate("2026-05-10", NOW)).toBe("10 may 2026");
  });

  it("returns '—' for unparseable input", () => {
    expect(relativeDate("not-a-date")).toBe("—");
    expect(relativeDate("")).toBe("—");
  });

  it("normalizes to local-day boundaries (no '23 hours ago' for ayer)", () => {
    // The fixed NOW is at 00:00 local; the input is the previous day.
    // We don't want minute-level math to bleed into the result.
    const lateNow = new Date(2026, 3, 28, 23, 59, 59);
    expect(relativeDate("2026-04-27", lateNow)).toBe("ayer");
  });
});

describe("absoluteDate", () => {
  it("formats Date and string inputs identically", () => {
    expect(absoluteDate(new Date(2026, 3, 16))).toBe("16 abr 2026");
    expect(absoluteDate("2026-04-16")).toBe("16 abr 2026");
  });

  it("handles single-digit days without padding", () => {
    expect(absoluteDate("2026-04-02")).toBe("2 abr 2026");
  });

  it("returns '—' for unparseable input", () => {
    expect(absoluteDate("garbage")).toBe("—");
  });
});

describe("shortDayMonth", () => {
  it("formats a date as 'D mmm'", () => {
    expect(shortDayMonth("2026-04-02")).toBe("2 abr");
    expect(shortDayMonth("2026-12-31")).toBe("31 dic");
  });

  it("returns '—' for malformed input", () => {
    expect(shortDayMonth("2026-04")).toBe("—");
    expect(shortDayMonth("")).toBe("—");
  });
});
