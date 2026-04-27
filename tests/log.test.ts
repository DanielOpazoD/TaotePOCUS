import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "@/lib/log";

// `lib/log.ts` is the seam where logging will be replaced with a real
// transport (Sentry / Logtail). The tests pin the public surface so the
// swap is mechanical.

describe("log", () => {
  let spies: Record<"debug" | "info" | "warn" | "error", ReturnType<typeof vi.spyOn>>;

  beforeEach(() => {
    spies = {
      debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    Object.values(spies).forEach((s) => s.mockRestore());
  });

  it.each([
    ["debug", "debug"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
  ] as const)("log.%s forwards to console.%s in non-production", (method, channel) => {
    log[method]("hello", { area: "test" });
    expect(spies[channel]).toHaveBeenCalled();
  });

  it("log.error captures an Error argument and includes its message", () => {
    log.error("boom", { area: "test" }, new Error("explosion"));
    const call = spies.error.mock.calls[0];
    const joined = JSON.stringify(call);
    expect(joined).toMatch(/explosion/);
  });

  it("log accepts no context and still works", () => {
    expect(() => log.info("standalone")).not.toThrow();
    expect(spies.info).toHaveBeenCalled();
  });
});
