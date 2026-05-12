// Static audit: any case persisted with `translationMeta.aiGenerated:
// true` must EITHER have `reviewedAt` set OR have been generated less
// than 30 days ago.
//
// Why: AI-suggested translations are scaffolding — a human editor
// has to confirm them before they count as published editorial
// content. Without this gate, stale unreviewed AI content would
// accumulate in production and a reader would have no way to know
// whether a description was vetted.
//
// What gets scanned: every case-shaped JSON in:
//
//   - `public/data/imported-cases.json` (the imported corpus)
//   - `lib/seed-cases.server.ts` (seed corpus, parsed via the
//     server module's exported array)
//
// The audit walks each case and flags entries that fail the
// invariant. The test framework prints the offending case ids so
// an admin can locate them and either review-approve them or
// re-translate.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const REVIEW_DEADLINE_DAYS = 30;

interface CaseShape {
  id: string;
  translationMeta?: {
    aiGenerated?: boolean;
    reviewedAt?: string;
    generatedAt?: string;
    provider?: string;
    model?: string;
  };
}

function loadImportedCases(): CaseShape[] {
  const path = join(ROOT, "public/data/imported-cases.json");
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as CaseShape[];
  } catch {
    // File optional — local dev without the imported corpus is
    // a valid state.
    return [];
  }
}

interface AuditHit {
  source: string;
  id: string;
  reason: string;
}

function auditCase(c: CaseShape, source: string, now = Date.now()): AuditHit | null {
  const meta = c.translationMeta;
  // No meta → nothing to audit. Most production cases are hand-
  // authored and never carry this field.
  if (!meta) return null;
  // The flag is set but reviewedAt missing — check the age.
  if (meta.aiGenerated === true) {
    if (meta.reviewedAt) return null; // reviewed → OK.
    if (!meta.generatedAt) {
      return {
        source,
        id: c.id,
        reason: "aiGenerated: true but missing generatedAt; cannot determine review deadline",
      };
    }
    const generatedAt = Date.parse(meta.generatedAt);
    if (Number.isNaN(generatedAt)) {
      return {
        source,
        id: c.id,
        reason: `generatedAt is not a valid ISO timestamp: "${meta.generatedAt}"`,
      };
    }
    const ageDays = (now - generatedAt) / (1000 * 60 * 60 * 24);
    if (ageDays > REVIEW_DEADLINE_DAYS) {
      return {
        source,
        id: c.id,
        reason: `AI-generated translation unreviewed for ${Math.floor(ageDays)} days (deadline: ${REVIEW_DEADLINE_DAYS} days)`,
      };
    }
  }
  return null;
}

describe("AI translation flag audit", () => {
  it("no published case has aiGenerated: true without review or within deadline", () => {
    const imported = loadImportedCases();
    const hits: AuditHit[] = [];
    for (const c of imported) {
      const hit = auditCase(c, "public/data/imported-cases.json");
      if (hit) hits.push(hit);
    }
    if (hits.length > 0) {
      const report = hits.map((h) => `  ${h.source}#${h.id}\n    → ${h.reason}`).join("\n");
      throw new Error(
        `AI-translation review deadline violated.\n\n` +
          `Either accept the suggestion in the admin panel (sets\n` +
          `reviewedAt) or remove the AI translation. Offenders:\n\n${report}\n`,
      );
    }
    expect(hits).toEqual([]);
  });

  it("auditCase invariant: hand-authored cases are always OK", () => {
    expect(auditCase({ id: "hand" } as CaseShape, "test")).toBeNull();
  });

  it("auditCase invariant: reviewed AI cases are OK regardless of age", () => {
    const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const hit = auditCase(
      {
        id: "old-but-reviewed",
        translationMeta: {
          aiGenerated: true,
          generatedAt: past,
          reviewedAt: past,
          provider: "gemini",
          model: "gemini-2.5-flash",
        },
      },
      "test",
    );
    expect(hit).toBeNull();
  });

  it("auditCase invariant: recent unreviewed AI case is OK (still in grace period)", () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const hit = auditCase(
      {
        id: "recent-unreviewed",
        translationMeta: {
          aiGenerated: true,
          generatedAt: recent,
          provider: "gemini",
          model: "gemini-2.5-flash",
        },
      },
      "test",
    );
    expect(hit).toBeNull();
  });

  it("auditCase invariant: stale unreviewed AI case fails the audit", () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const hit = auditCase(
      {
        id: "stale",
        translationMeta: {
          aiGenerated: true,
          generatedAt: old,
          provider: "gemini",
          model: "gemini-2.5-flash",
        },
      },
      "test",
    );
    expect(hit).not.toBeNull();
    expect(hit?.reason).toMatch(/unreviewed for \d+ days/);
  });
});
