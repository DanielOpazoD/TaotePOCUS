// Tests for `lib/ai-batch-undo.ts`. Covers the storage round-trip,
// TTL expiry, and the type-guard defenses. The module is small but
// load-bearing for the user-facing "Deshacer último batch" safety
// net — a corrupted localStorage entry that crashes the banner
// would silently remove the only recovery path after a bad bulk
// rewrite.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearLastAIBatch,
  clearAIBatchUndoForTests,
  entryFromCase,
  getLastAIBatch,
  rememberAIBatch,
} from "@/lib/ai-batch-undo";
import type { CaseRecord } from "@/lib/types";

function makeCase(id: string, overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id,
    section: "atlas",
    title: { es: `Original ${id}` },
    category: "cardiac",
    tags: { es: ["a", "b"] },
    modality: "",
    loop: "blines",
    author: "Admin",
    role: "Admin",
    date: "2026-01-01",
    description: { es: `Desc ${id}` },
    featured: false,
    ...overrides,
  };
}

beforeEach(() => {
  clearAIBatchUndoForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ai-batch-undo", () => {
  describe("entryFromCase", () => {
    it("captures title, description, and tags by value (not by reference)", () => {
      const c = makeCase("c1");
      const entry = entryFromCase(c);
      // Mutating the original AFTER capture must not affect the snapshot.
      c.title.es = "mutated";
      c.tags.es.push("c");
      expect(entry.before.title?.es).toBe("Original c1");
      expect(entry.before.tags?.es).toEqual(["a", "b"]);
    });

    it("captures translationMeta only when present (undefined otherwise)", () => {
      const without = entryFromCase(makeCase("c1"));
      expect(without.before.translationMeta).toBeUndefined();

      const withMeta = entryFromCase(
        makeCase("c2", {
          translationMeta: {
            aiGenerated: true,
            provider: "deepseek",
            model: "deepseek-chat",
            generatedAt: "2026-05-17T00:00:00Z",
          },
        }),
      );
      expect(withMeta.before.translationMeta).toEqual({
        aiGenerated: true,
        provider: "deepseek",
        model: "deepseek-chat",
        generatedAt: "2026-05-17T00:00:00Z",
      });
    });

    it("captures the EN tag slot when present", () => {
      const c = makeCase("c1", { tags: { es: ["x"], en: ["y"] } });
      const entry = entryFromCase(c);
      expect(entry.before.tags?.en).toEqual(["y"]);
    });
  });

  describe("rememberAIBatch + getLastAIBatch", () => {
    it("round-trips a batch through localStorage", () => {
      const entries = [entryFromCase(makeCase("c1")), entryFromCase(makeCase("c2"))];
      rememberAIBatch("rewrite", entries);
      const got = getLastAIBatch();
      expect(got?.operation).toBe("rewrite");
      expect(got?.entries).toHaveLength(2);
      expect(got?.entries[0]?.caseId).toBe("c1");
      expect(got?.batchId).toMatch(/^rewrite-\d+$/);
      expect(typeof got?.appliedAt).toBe("number");
    });

    it("overwrites the prior batch (single-slot, not a history)", () => {
      rememberAIBatch("rewrite", [entryFromCase(makeCase("c1"))]);
      rememberAIBatch("translate", [entryFromCase(makeCase("c2"))]);
      const got = getLastAIBatch();
      expect(got?.operation).toBe("translate");
      expect(got?.entries[0]?.caseId).toBe("c2");
    });

    it("ignores empty-entry calls — no buffer write", () => {
      // Caller passed in zero successful patches (every case in
      // the batch failed). There's nothing to revert, so the buffer
      // stays as it was.
      rememberAIBatch("rewrite", [entryFromCase(makeCase("seed"))]);
      rememberAIBatch("rewrite", []);
      expect(getLastAIBatch()?.entries[0]?.caseId).toBe("seed");
    });

    it("returns null when there's no batch in scope", () => {
      expect(getLastAIBatch()).toBeNull();
    });
  });

  describe("TTL", () => {
    it("drops batches older than 24h on read", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-17T00:00:00Z"));
      rememberAIBatch("rewrite", [entryFromCase(makeCase("c1"))]);
      // Jump 25 hours forward.
      vi.setSystemTime(new Date("2026-05-18T01:00:00Z"));
      expect(getLastAIBatch()).toBeNull();
    });

    it("keeps batches within the 24h window", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-17T00:00:00Z"));
      rememberAIBatch("rewrite", [entryFromCase(makeCase("c1"))]);
      vi.setSystemTime(new Date("2026-05-17T23:30:00Z"));
      expect(getLastAIBatch()?.entries[0]?.caseId).toBe("c1");
    });
  });

  describe("defensive type guard", () => {
    it("returns null on malformed JSON in storage", () => {
      window.localStorage.setItem("taote.ai.lastBatch", "{not valid json");
      expect(getLastAIBatch()).toBeNull();
      // Bad data is wiped on read so subsequent reads stay fast.
      expect(window.localStorage.getItem("taote.ai.lastBatch")).toBeNull();
    });

    it("returns null on structurally wrong payload (missing batchId)", () => {
      window.localStorage.setItem(
        "taote.ai.lastBatch",
        JSON.stringify({ entries: [], operation: "rewrite", appliedAt: Date.now() }),
      );
      expect(getLastAIBatch()).toBeNull();
    });

    it("returns null on unknown operation value", () => {
      window.localStorage.setItem(
        "taote.ai.lastBatch",
        JSON.stringify({
          batchId: "x",
          appliedAt: Date.now(),
          operation: "not-a-real-op",
          entries: [],
        }),
      );
      expect(getLastAIBatch()).toBeNull();
    });
  });

  describe("clearLastAIBatch", () => {
    it("wipes the persisted batch", () => {
      rememberAIBatch("rewrite", [entryFromCase(makeCase("c1"))]);
      expect(getLastAIBatch()).not.toBeNull();
      clearLastAIBatch();
      expect(getLastAIBatch()).toBeNull();
    });
  });
});
