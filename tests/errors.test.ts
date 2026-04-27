import { describe, expect, it } from "vitest";
import { AuthError, StorageError, err, isAuthError, isErr, isOk, ok, unwrap } from "@/lib/errors";

describe("Result<T, E>", () => {
  it("ok() builds a successful result", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (r.ok) expect(r.value).toBe(42);
  });

  it("err() builds a failed result", () => {
    const r = err("nope");
    expect(r.ok).toBe(false);
    expect(isErr(r)).toBe(true);
    if (!r.ok) expect(r.error).toBe("nope");
  });

  it("unwrap returns the value on Ok", () => {
    expect(unwrap(ok("hello"))).toBe("hello");
  });

  it("unwrap throws the underlying Error on Err", () => {
    const e = new Error("boom");
    expect(() => unwrap(err(e))).toThrow("boom");
  });

  it("unwrap wraps non-Error errors before throwing", () => {
    expect(() => unwrap(err("string error"))).toThrow("string error");
  });
});

describe("AuthError", () => {
  it("preserves the discriminator code and a stack", () => {
    const e = new AuthError("wrong_admin_password", "nope");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("AuthError");
    expect(e.code).toBe("wrong_admin_password");
    expect(typeof e.stack).toBe("string");
  });

  it.each([
    ["missing_email", /correo/i],
    ["wrong_admin_password", /administrador/i],
    ["expired", /sesi[oó]n/i],
    ["unknown", /sesi[oó]n/i],
  ] as const)("userMessage for %s reads naturally", (code, expected) => {
    const e = new AuthError(code, "internal");
    expect(e.userMessage).toMatch(expected);
  });

  it("isAuthError narrows correctly", () => {
    expect(isAuthError(new AuthError("missing_email", "x"))).toBe(true);
    expect(isAuthError(new Error("plain"))).toBe(false);
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError({ name: "AuthError" })).toBe(true); // structural — survives JSON
  });
});

describe("StorageError", () => {
  it("uses the default message keyed off reason", () => {
    expect(new StorageError("quota").message).toMatch(/espacio/i);
    expect(new StorageError("unavailable").message).toMatch(/almacenamiento/i);
    expect(new StorageError("unknown").message).toMatch(/guardar/i);
  });

  it("respects an explicit override message", () => {
    expect(new StorageError("quota", "custom").message).toBe("custom");
  });
});
