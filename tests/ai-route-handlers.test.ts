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
    expect(body.reason).toMatch(/provider must be one of/);
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
    expect(body.reason).toMatch(/direction must be/);
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
