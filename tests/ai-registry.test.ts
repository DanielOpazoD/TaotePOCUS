// Provider-registry tests. Pin the availability logic, the default
// resolution, and the snapshot shape so the admin selector UI can
// rely on a stable contract.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ALL_PROVIDERS,
  getProvider,
  resolveDefaultProvider,
  snapshotRegistry,
} from "@/lib/ai/registry";

// Tests mutate process.env per case to simulate Netlify env states.
// Snapshot + restore so cases don't leak into each other.
const ENV_KEYS = ["GEMINI_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY", "AI_PROVIDER_DEFAULT"];
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = savedEnv[k];
    }
  }
});

describe("AI provider registry", () => {
  it("knows about exactly the four providers in resolution order", () => {
    expect(ALL_PROVIDERS.map((p) => p.id)).toEqual(["gemini", "openai", "deepseek", "stub"]);
  });

  it("getProvider returns the matching provider", () => {
    expect(getProvider("stub")?.id).toBe("stub");
    expect(getProvider("gemini")?.id).toBe("gemini");
  });

  it("getProvider returns null for unknown ids", () => {
    // The cast bypasses TS's `ProviderId` narrowing — at runtime
    // the registry can receive arbitrary strings from a malformed
    // client request, and we want the null-return behavior pinned.
    expect(getProvider("unknown" as never)).toBeNull();
  });

  describe("availability", () => {
    it("stub is always available regardless of env", () => {
      expect(getProvider("stub")?.isAvailable()).toEqual({ available: true });
    });

    it("gemini is unavailable when GEMINI_API_KEY is unset", () => {
      const check = getProvider("gemini")!.isAvailable();
      expect(check.available).toBe(false);
      if (check.available === false) {
        expect(check.reason).toContain("GEMINI_API_KEY");
      }
    });

    it("gemini becomes available when GEMINI_API_KEY is set", () => {
      process.env.GEMINI_API_KEY = "test-key-with-enough-length";
      expect(getProvider("gemini")?.isAvailable()).toEqual({ available: true });
    });

    it("openai mirrors the OPENAI_API_KEY presence", () => {
      expect(getProvider("openai")?.isAvailable().available).toBe(false);
      process.env.OPENAI_API_KEY = "sk-test-key-long-enough";
      expect(getProvider("openai")?.isAvailable()).toEqual({ available: true });
    });

    it("deepseek mirrors the DEEPSEEK_API_KEY presence", () => {
      expect(getProvider("deepseek")?.isAvailable().available).toBe(false);
      process.env.DEEPSEEK_API_KEY = "ds-test-key-long-enough";
      expect(getProvider("deepseek")?.isAvailable()).toEqual({ available: true });
    });

    it("rejects short keys as if unset (defensive against accidental empty strings)", () => {
      process.env.GEMINI_API_KEY = "a"; // shorter than 10 chars threshold
      const check = getProvider("gemini")!.isAvailable();
      expect(check.available).toBe(false);
    });
  });

  describe("resolveDefaultProvider", () => {
    it("falls back to stub when no real provider is available", () => {
      expect(resolveDefaultProvider().id).toBe("stub");
    });

    it("prefers gemini when GEMINI_API_KEY is set", () => {
      process.env.GEMINI_API_KEY = "gemini-key-long-enough";
      expect(resolveDefaultProvider().id).toBe("gemini");
    });

    it("prefers gemini over openai when both are set (resolution order)", () => {
      process.env.GEMINI_API_KEY = "gemini-key-long-enough";
      process.env.OPENAI_API_KEY = "sk-test-key-long-enough";
      expect(resolveDefaultProvider().id).toBe("gemini");
    });

    it("falls back to openai when gemini is unset", () => {
      process.env.OPENAI_API_KEY = "sk-test-key-long-enough";
      expect(resolveDefaultProvider().id).toBe("openai");
    });

    it("AI_PROVIDER_DEFAULT env var overrides the resolution order", () => {
      process.env.GEMINI_API_KEY = "gemini-key-long-enough";
      process.env.OPENAI_API_KEY = "sk-test-key-long-enough";
      process.env.AI_PROVIDER_DEFAULT = "openai";
      expect(resolveDefaultProvider().id).toBe("openai");
    });

    it("AI_PROVIDER_DEFAULT falls through to resolution order when its target is unavailable", () => {
      // Set DEFAULT to a provider whose key isn't configured —
      // expect the standard resolution chain to kick in.
      process.env.GEMINI_API_KEY = "gemini-key-long-enough";
      process.env.AI_PROVIDER_DEFAULT = "deepseek";
      expect(resolveDefaultProvider().id).toBe("gemini");
    });
  });

  describe("snapshotRegistry", () => {
    it("returns one entry per known provider", () => {
      const snap = snapshotRegistry();
      expect(snap.providers.map((p) => p.id).sort()).toEqual(
        ["deepseek", "gemini", "openai", "stub"].sort(),
      );
    });

    it("defaultId reflects the current env state", () => {
      expect(snapshotRegistry().defaultId).toBe("stub");
      process.env.GEMINI_API_KEY = "gemini-key-long-enough";
      expect(snapshotRegistry().defaultId).toBe("gemini");
    });

    it("each entry includes id, displayName, and availability", () => {
      const snap = snapshotRegistry();
      for (const p of snap.providers) {
        expect(typeof p.id).toBe("string");
        expect(typeof p.displayName).toBe("string");
        expect(typeof p.availability.available).toBe("boolean");
      }
    });
  });
});
