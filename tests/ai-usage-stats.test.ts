// Tests for `lib/ai-usage-stats.ts`. Covers the storage round-trip,
// per-provider rate math, and the defensive paths (missing values,
// month rollover, bad JSON).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearUsageStatsForTests,
  formatCostUSD,
  getCurrentMonthStats,
  recordAICall,
} from "@/lib/ai-usage-stats";

beforeEach(() => {
  clearUsageStatsForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ai-usage-stats", () => {
  describe("getCurrentMonthStats", () => {
    it("returns a zeroed snapshot when storage is empty", () => {
      const stats = getCurrentMonthStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.totalInputTokens).toBe(0);
      expect(stats.totalOutputTokens).toBe(0);
      expect(stats.estimatedCostUSD).toBe(0);
      expect(stats.monthKey).toMatch(/^\d{4}-\d{2}$/);
    });

    it("uses the current calendar month (UTC) as the key", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-15T10:00:00Z"));
      expect(getCurrentMonthStats().monthKey).toBe("2026-07");
    });
  });

  describe("recordAICall", () => {
    it("increments totalCalls and accumulates tokens", () => {
      recordAICall("deepseek", 1000, 500);
      recordAICall("deepseek", 2000, 800);
      const stats = getCurrentMonthStats();
      expect(stats.totalCalls).toBe(2);
      expect(stats.totalInputTokens).toBe(3000);
      expect(stats.totalOutputTokens).toBe(1300);
    });

    it("computes an estimated cost using the per-provider rate", () => {
      // DeepSeek: $0.14 / 1M input → $0.00014 / 1K input.
      // 1000 input tokens = $0.00014, 500 output ($0.28/1M) = $0.00014.
      // Total ≈ $0.00028.
      recordAICall("deepseek", 1000, 500);
      const stats = getCurrentMonthStats();
      expect(stats.estimatedCostUSD).toBeCloseTo(0.00028, 5);
    });

    it("uses a different rate for openai (higher) vs deepseek", () => {
      // OpenAI: $0.25/1M input + $2/1M output. 1000+500 → $0.00025 + $0.001 = $0.00125.
      recordAICall("openai", 1000, 500);
      const stats = getCurrentMonthStats();
      expect(stats.estimatedCostUSD).toBeCloseTo(0.00125, 5);
    });

    it("treats null token values as zero (doesn't crash, doesn't double-count)", () => {
      recordAICall("deepseek", null, null);
      const stats = getCurrentMonthStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.totalInputTokens).toBe(0);
      expect(stats.totalOutputTokens).toBe(0);
      expect(stats.estimatedCostUSD).toBe(0);
    });

    it("treats unknown providers as zero-cost (no crash, no estimate)", () => {
      recordAICall("not-a-real-provider", 100, 50);
      const stats = getCurrentMonthStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.estimatedCostUSD).toBe(0);
    });

    it("dispatches a custom event so same-tab listeners can refresh", () => {
      const handler = vi.fn();
      window.addEventListener("taote-ai-usage-updated", handler);
      recordAICall("deepseek", 100, 100);
      expect(handler).toHaveBeenCalledTimes(1);
      window.removeEventListener("taote-ai-usage-updated", handler);
    });
  });

  describe("month rollover", () => {
    it("starts a fresh counter when the month changes", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-31T23:59:00Z"));
      recordAICall("deepseek", 1000, 500);
      expect(getCurrentMonthStats().totalCalls).toBe(1);

      // Move forward to June.
      vi.setSystemTime(new Date("2026-06-01T00:01:00Z"));
      // The fresh-month key has no data → zeroed snapshot.
      expect(getCurrentMonthStats().totalCalls).toBe(0);

      // Adding a call in June doesn't affect the May total.
      recordAICall("deepseek", 500, 100);
      expect(getCurrentMonthStats().totalCalls).toBe(1);
      expect(getCurrentMonthStats().totalInputTokens).toBe(500);
    });
  });

  describe("defensive read paths", () => {
    it("returns zeroed stats when storage holds malformed JSON", () => {
      // Force a broken value under the current-month key.
      const monthKey = getCurrentMonthStats().monthKey;
      window.localStorage.setItem(`taote.ai.usage.${monthKey}`, "{not json");
      const stats = getCurrentMonthStats();
      expect(stats.totalCalls).toBe(0);
    });

    it("returns zeroed stats when storage holds the wrong shape", () => {
      const monthKey = getCurrentMonthStats().monthKey;
      window.localStorage.setItem(`taote.ai.usage.${monthKey}`, JSON.stringify({ wrong: true }));
      expect(getCurrentMonthStats().totalCalls).toBe(0);
    });
  });

  describe("formatCostUSD", () => {
    it("formats zero as $0.00", () => {
      expect(formatCostUSD(0)).toBe("$0.00");
    });
    it("formats small values with 2 decimals", () => {
      expect(formatCostUSD(0.00028)).toBe("$0.00");
      expect(formatCostUSD(0.18)).toBe("$0.18");
    });
    it("formats whole dollars with 2 decimals", () => {
      expect(formatCostUSD(2)).toBe("$2.00");
      expect(formatCostUSD(13.5)).toBe("$13.50");
    });
  });
});
