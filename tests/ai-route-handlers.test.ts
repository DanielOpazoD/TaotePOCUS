// Route handler tests for the AI endpoints. Cover the four
// concerns the route owns:
//   1. Auth gate (admin-only).
//   2. Input validation (malformed body → 400 with reason).
//   3. Provider dispatch (request reaches the right provider).
//   4. Error translation (provider failures → structured 5xx).
//
// The stub provider is the workhorse — deterministic output means
// we can assert on exact response bodies. The Gemini / OpenAI /
// DeepSeek paths are tested for ROUTING (correct provider gets
// called) but not for SDK internals — those live in the
// provider-level tests once we stub the SDK clients.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Allow per-test session mocks via Vitest's auto-mocking + the
// shared mock function below. The default returns null → 403.
const mockedRequireAdmin = vi.fn();
vi.mock("@/lib/server/session", () => ({
  requireAdmin: () => mockedRequireAdmin(),
}));

import { POST as translatePOST } from "@/app/api/admin/ai/translate/route";
import { GET as providersGET } from "@/app/api/admin/ai/providers/route";
import { POST as healthPOST } from "@/app/api/admin/ai/health/route";
import { POST as rewritePOST } from "@/app/api/admin/ai/rewrite/route";
import { POST as autotagPOST } from "@/app/api/admin/ai/autotag/route";

process.env.AI_STUB_INSTANT = "1";

const ADMIN_SESSION = { email: "admin@taote.pocus", role: "admin", expiresAt: 0, issuedAt: 0 };

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/ai/translate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockedRequireAdmin.mockReset();
  // Wipe all AI env vars so each test starts from a clean slate;
  // tests that need a provider available re-set its key.
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/ai/providers", () => {
  it("returns 403 when no admin session", async () => {
    mockedRequireAdmin.mockResolvedValue(null);
    const res = await providersGET();
    expect(res.status).toBe(403);
  });

  it("returns the registry snapshot for admins", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await providersGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.defaultId).toBe("stub"); // no env vars set → stub default
    expect(body.providers).toHaveLength(4);
    const ids = body.providers.map((p: { id: string }) => p.id).sort();
    expect(ids).toEqual(["deepseek", "gemini", "openai", "stub"]);
    // Stub is the only one available without env vars.
    const stub = body.providers.find((p: { id: string }) => p.id === "stub");
    expect(stub.availability).toEqual({ available: true });
    const gemini = body.providers.find((p: { id: string }) => p.id === "gemini");
    expect(gemini.availability.available).toBe(false);
    expect(gemini.availability.reason).toContain("GEMINI_API_KEY");
  });

  it("flips gemini to available once GEMINI_API_KEY is set", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    process.env.GEMINI_API_KEY = "test-key-long-enough";
    const res = await providersGET();
    const body = await res.json();
    expect(body.defaultId).toBe("gemini");
    const gemini = body.providers.find((p: { id: string }) => p.id === "gemini");
    expect(gemini.availability).toEqual({ available: true });
  });
});

describe("POST /api/admin/ai/translate — auth + validation", () => {
  it("returns 403 when no admin session", async () => {
    mockedRequireAdmin.mockResolvedValue(null);
    const res = await translatePOST(
      jsonRequest({
        provider: "stub",
        direction: "es-to-en",
        source: { title: "X", description: "Y.", tags: [] },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 on non-JSON body", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const req = new Request("http://localhost/api/admin/ai/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await translatePOST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when provider is missing or unknown", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await translatePOST(
      jsonRequest({
        provider: "made-up",
        direction: "es-to-en",
        source: { title: "X", description: "Y.", tags: [] },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    // Schema-driven error: the message comes from zod and follows the
    // shape `<path>: <message>`. Locked to the path (`provider`) so a
    // future zod upgrade that tweaks the message wording still passes.
    expect(body.reason).toMatch(/^provider:/);
  });

  it("returns 400 when direction is invalid", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await translatePOST(
      jsonRequest({
        provider: "stub",
        direction: "fr-to-en",
        source: { title: "X", description: "Y.", tags: [] },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toMatch(/^direction:/);
  });

  it("returns 400 when source.title is missing", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await translatePOST(
      jsonRequest({
        provider: "stub",
        direction: "es-to-en",
        source: { description: "Y.", tags: [] },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when source.title is too long", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await translatePOST(
      jsonRequest({
        provider: "stub",
        direction: "es-to-en",
        source: { title: "a".repeat(501), description: "Y.", tags: [] },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when tags has a non-string entry", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await translatePOST(
      jsonRequest({
        provider: "stub",
        direction: "es-to-en",
        source: { title: "X", description: "Y.", tags: ["ok", 42] },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 when the requested provider isn't available", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    // GEMINI_API_KEY is wiped in beforeEach — gemini should be
    // unavailable and report a structured 503.
    const res = await translatePOST(
      jsonRequest({
        provider: "gemini",
        direction: "es-to-en",
        source: { title: "X", description: "Y.", tags: [] },
      }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Provider unavailable");
    expect(body.reason).toContain("GEMINI_API_KEY");
  });
});

describe("POST /api/admin/ai/translate — dispatch (stub)", () => {
  it("returns the stub's deterministic ES→EN output", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await translatePOST(
      jsonRequest({
        provider: "stub",
        direction: "es-to-en",
        source: {
          title: "Insuficiencia cardíaca",
          description: "Disnea con B-líneas bilaterales.",
          tags: ["B-líneas", "ICC"],
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.title).toBe("[stub ES→EN] Insuficiencia cardíaca");
    expect(body.result.description).toBe("[stub ES→EN] Disnea con B-líneas bilaterales.");
    expect(body.result.tags).toEqual(["en:B-líneas", "en:ICC"]);
    expect(body.meta.provider).toBe("stub");
    expect(body.meta.model).toBe("stub-deterministic-v1");
  });

  it("accepts optional fewShotExamples without breaking", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await translatePOST(
      jsonRequest({
        provider: "stub",
        direction: "es-to-en",
        source: { title: "X", description: "Y.", tags: [] },
        fewShotExamples: [
          {
            es: { title: "Ejemplo", description: "Texto.", tags: ["a"] },
            en: { title: "Example", description: "Text.", tags: ["a"] },
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 when fewShotExamples has more than 5 entries", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const ex = {
      es: { title: "a", description: "a.", tags: [] },
      en: { title: "a", description: "a.", tags: [] },
    };
    const res = await translatePOST(
      jsonRequest({
        provider: "stub",
        direction: "es-to-en",
        source: { title: "X", description: "Y.", tags: [] },
        fewShotExamples: [ex, ex, ex, ex, ex, ex], // 6 → over limit
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/ai/health", () => {
  function healthRequest(body?: unknown): Request {
    return new Request("http://localhost/api/admin/ai/health", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it("returns 403 when no admin session", async () => {
    mockedRequireAdmin.mockResolvedValue(null);
    const res = await healthPOST(healthRequest({}));
    expect(res.status).toBe(403);
  });

  it("pings the resolved default provider when no body is supplied", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    // No env vars set → defaults to stub → stub.translate returns
    // deterministic placeholder + meta.model = "stub-deterministic-v1".
    const res = await healthPOST(healthRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providerId).toBe("stub");
    expect(body.ok).toBe(true);
    expect(body.model).toBe("stub-deterministic-v1");
    expect(typeof body.latencyMs).toBe("number");
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof body.checkedAt).toBe("string");
  });

  it("pings the explicitly-named provider when providerId is in the body", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await healthPOST(healthRequest({ providerId: "stub" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providerId).toBe("stub");
    expect(body.providerName).toBe("Stub (local · deterministic)");
    expect(body.ok).toBe(true);
  });

  it("returns 400 when providerId is malformed", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await healthPOST(healthRequest({ providerId: "not-a-provider" }));
    expect(res.status).toBe(400);
  });

  it("falls back to the default provider when the body is malformed JSON", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const req = new Request("http://localhost/api/admin/ai/health", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await healthPOST(req);
    // Malformed body is benign — it's optional. Should treat as
    // "use default provider" rather than 400, because the user clicked
    // "Probar conexión" without anything in particular to provide.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  // NOT tested here: the "ok:false on real provider failure" path.
  // To assert that the route surfaces a structured `{ ok: false,
  // error }` (rather than a 5xx) when a provider call fails, we'd
  // either need to:
  //   (a) Make a real network call with a fake key — flaky and
  //       slow under CI.
  //   (b) Mock the OpenAI SDK or stub the provider import chain —
  //       adds test scaffolding for marginal value.
  // The structured-failure shape is exercised by the type system
  // (`HealthResponseFail`) and documented in the route header. If
  // we ever see drift here, the next admin who clicks "Probar
  // conexión" with a misconfigured key will surface it immediately.
});

describe("POST /api/admin/ai/rewrite", () => {
  function rewriteRequest(body: unknown): Request {
    return new Request("http://localhost/api/admin/ai/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const validSource = {
    title: "Disnea aguda",
    description: "Múltiples B-líneas en ambos hemitórax.",
    tags: ["pulmonar"],
  };

  it("returns 403 when no admin session", async () => {
    mockedRequireAdmin.mockResolvedValue(null);
    const res = await rewritePOST(rewriteRequest({ source: validSource }));
    expect(res.status).toBe(403);
  });

  it("returns 400 on non-JSON body", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const req = new Request("http://localhost/api/admin/ai/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await rewritePOST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when source is missing or malformed", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res1 = await rewritePOST(rewriteRequest({}));
    expect(res1.status).toBe(400);
    const res2 = await rewritePOST(
      rewriteRequest({ source: { title: "", description: "x", tags: [] } }),
    );
    expect(res2.status).toBe(400);
  });

  it("returns 400 when instruction exceeds 500 chars", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const longInstruction = "x".repeat(501);
    const res = await rewritePOST(
      rewriteRequest({ source: validSource, instruction: longInstruction }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toMatch(/500 chars/);
  });

  it("defaults to the resolved provider when none is supplied", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    // No env vars set → defaults to stub → stub.rewriteCase returns
    // deterministic ES + EN with marker prefixes.
    const res = await rewritePOST(rewriteRequest({ source: validSource }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.es.title).toMatch(/^\[stub rewrite ES\]/);
    expect(body.result.en.title).toMatch(/^\[stub rewrite EN\]/);
    expect(body.meta.provider).toBe("stub");
    expect(body.meta.model).toBe("stub-deterministic-v1");
  });

  it("routes to the explicitly-named provider when supplied", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await rewritePOST(rewriteRequest({ provider: "stub", source: validSource }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.provider).toBe("stub");
  });

  it("returns 400 for unknown providers", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await rewritePOST(
      rewriteRequest({ provider: "not-a-provider", source: validSource }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 when the explicit provider isn't available", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    // DEEPSEEK_API_KEY is unset → deepseek.isAvailable() is false.
    const res = await rewritePOST(rewriteRequest({ provider: "deepseek", source: validSource }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.reason).toMatch(/DEEPSEEK_API_KEY/);
  });

  it("threads the instruction through to the stub (appears in result)", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await rewritePOST(
      rewriteRequest({ source: validSource, instruction: "más conciso" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Stub appends "(custom: ...)" to titles when instruction is present.
    expect(body.result.es.title).toContain("más conciso");
    expect(body.result.en.title).toContain("más conciso");
  });

  it("returns both ES and EN with the LocalizedCaseContent shape", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await rewritePOST(rewriteRequest({ source: validSource }));
    const body = await res.json();
    for (const lang of ["es", "en"] as const) {
      expect(typeof body.result[lang].title).toBe("string");
      expect(typeof body.result[lang].description).toBe("string");
      expect(Array.isArray(body.result[lang].tags)).toBe(true);
    }
  });
});

describe("POST /api/admin/ai/autotag", () => {
  function autotagRequest(body: unknown): Request {
    return new Request("http://localhost/api/admin/ai/autotag", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  const validSource = {
    title: "Apendicitis aguda",
    description: "Apéndice no compresible, signo de diana, líquido periapendicular.",
  };

  it("returns 403 when no admin session", async () => {
    mockedRequireAdmin.mockResolvedValue(null);
    const res = await autotagPOST(autotagRequest({ source: validSource }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when source is missing", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await autotagPOST(autotagRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when source.title is empty", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await autotagPOST(
      autotagRequest({ source: { title: "", description: "non-empty desc." } }),
    );
    expect(res.status).toBe(400);
  });

  it("defaults to the resolved provider when none is supplied", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await autotagPOST(autotagRequest({ source: validSource }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.provider).toBe("stub");
    expect(Array.isArray(body.result.es)).toBe(true);
    expect(Array.isArray(body.result.en)).toBe(true);
  });

  it("returns 1-3 tags per language (the editorial contract)", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await autotagPOST(autotagRequest({ source: validSource }));
    const body = await res.json();
    expect(body.result.es.length).toBeGreaterThanOrEqual(1);
    expect(body.result.es.length).toBeLessThanOrEqual(3);
    expect(body.result.en.length).toBeGreaterThanOrEqual(1);
    expect(body.result.en.length).toBeLessThanOrEqual(3);
  });

  it("returns 503 when the explicit provider isn't available", async () => {
    mockedRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await autotagPOST(autotagRequest({ provider: "openai", source: validSource }));
    expect(res.status).toBe(503);
  });
});
