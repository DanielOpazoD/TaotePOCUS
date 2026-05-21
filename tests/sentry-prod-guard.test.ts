// Tests for `scripts/sentry-prod-guard.mjs` — the CI build guard
// that fails production builds without a Sentry DSN.
//
// We invoke the script as a child process rather than importing
// the module because the script's surface IS the exit code +
// stderr message. Testing through the public CLI contract catches
// regressions a unit-level import wouldn't (e.g., a future refactor
// that no longer exits with the right code).

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "sentry-prod-guard.mjs");

function runGuard(env: Record<string, string | undefined>) {
  // Inherit only PATH + the explicit overrides — don't leak the
  // host env into the script (would defeat the test isolation).
  // The cast to NodeJS.ProcessEnv satisfies spawnSync's type
  // signature without requiring us to populate every Node-specific
  // env field; the script only reads the names below.
  const cleanEnv = { PATH: process.env.PATH ?? "" } as Record<string, string>;
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) cleanEnv[k] = v;
  }
  return spawnSync("node", [SCRIPT], {
    env: cleanEnv as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
}

describe("scripts/sentry-prod-guard.mjs", () => {
  it("skips silently on a non-production build", () => {
    const result = runGuard({ NODE_ENV: "development", CI: undefined });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/skipping check/);
  });

  it("passes when NEXT_PUBLIC_SENTRY_DSN is set on a production build", () => {
    const result = runGuard({
      NODE_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: "https://key@o12345.ingest.us.sentry.io/678",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/OK/);
    // The hostname appears in the log, but not the key.
    expect(result.stdout).toMatch(/sentry\.io/);
    expect(result.stdout).not.toMatch(/key@/);
  });

  it("fails when NEXT_PUBLIC_SENTRY_DSN is empty on a production build", () => {
    const result = runGuard({ NODE_ENV: "production", NEXT_PUBLIC_SENTRY_DSN: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/FAIL/);
    expect(result.stderr).toMatch(/silently/);
  });

  it("fails when NEXT_PUBLIC_SENTRY_DSN is unset on a production build", () => {
    const result = runGuard({ NODE_ENV: "production" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/FAIL/);
  });

  it("fails when the DSN is set but unparseable as a URL", () => {
    const result = runGuard({
      NODE_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: "this is not a url",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/unparseable/);
  });

  it("treats CI=true as a production build", () => {
    const result = runGuard({ CI: "true" });
    expect(result.status).toBe(1); // No DSN set → fails like production.
  });

  it("allows missing DSN when ALLOW_MISSING_SENTRY_DSN=1 (warns)", () => {
    const result = runGuard({
      NODE_ENV: "production",
      ALLOW_MISSING_SENTRY_DSN: "1",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/WARNING/);
    expect(result.stderr).toMatch(/Restore the DSN/);
  });
});
