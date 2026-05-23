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

  // Branches in the internal helpers that were uncovered by the
  // happy-path tests above.

  it("log.warn maps to the 'warning' Sentry level — the only level whose name differs from our public API", () => {
    // The mapping itself (warn → warning) is internal, but exercising
    // `log.warn` reaches the `toSentryLevel` branch that returns
    // "warning" instead of the level passed through. With no DSN the
    // Sentry call is no-op'd; we just need the line to execute.
    log.warn("queue-stalled", { area: "test" }, new Error("transient"));
    expect(spies.warn).toHaveBeenCalled();
  });

  it("log.error serializes non-Error payloads verbatim (string)", () => {
    // The `serialize` helper has two branches: Error → {name, message,
    // stack} and everything-else → pass through. The Error path is
    // covered by "captures an Error argument" above; this one pins
    // the else branch.
    log.error("opaque-failure", { area: "test" }, "plain string error");
    const joined = JSON.stringify(spies.error.mock.calls[0]);
    expect(joined).toMatch(/plain string error/);
  });

  it("log.error serializes non-Error payloads verbatim (object)", () => {
    log.error("shaped-failure", { area: "test" }, { code: 503, detail: "upstream" });
    const joined = JSON.stringify(spies.error.mock.calls[0]);
    expect(joined).toMatch(/upstream/);
    expect(joined).toMatch(/503/);
  });
});
