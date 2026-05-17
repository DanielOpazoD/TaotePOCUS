// AI provider interface — a single seam that every concrete
// provider (stub, Gemini, OpenAI, DeepSeek, …) implements. Adding
// a new provider means writing one file in `lib/ai/` that exports
// an object conforming to `AIProvider`, then registering it in
// `lib/ai/registry.ts`.
//
// Design constraints:
//
//   1. **No SDK imports leak past this file.** Every provider
//      module re-exports the SDK calls behind the interface, so
//      route handlers and React components never have to know
//      whether they're talking to Google, OpenAI, or a stub.
//
//   2. **Suggestions, never auto-apply.** Every method returns
//      a *suggestion*. The admin reviews + applies via the UI.
//      Schemas carry an `aiGenerated` flag + a `reviewedAt`
//      timestamp so production data is auditable.
//
//   3. **Deterministic stub.** The stub provider returns fixed
//      transforms of its input, no randomness. Unit tests + local
//      dev work without network or API keys.
//
//   4. **Strict output schemas.** Each method's return type is
//      validated by Zod at the route-handler boundary (see
//      `app/api/admin/ai/translate/route.ts`). A provider that
//      returns malformed JSON gets a 502 reject rather than
//      polluting the database.

/**
 * The fixed set of providers we know how to talk to. Adding a new
 * one requires:
 *   1. A new file in `lib/ai/` (e.g., `cohere.ts`).
 *   2. Adding the id here.
 *   3. Registering in `lib/ai/registry.ts` with its availability
 *      check (typically an env-var presence test).
 *   4. Optionally adding a display name in `PROVIDER_DISPLAY_NAMES`.
 *
 * `stub` is always available — that's the local-dev / test fallback.
 */
export type ProviderId = "stub" | "gemini" | "openai" | "deepseek";

/** Human-readable provider names for the UI selector. Keep these
 *  short and clear; the selector renders these as the option labels. */
export const PROVIDER_DISPLAY_NAMES: Record<ProviderId, string> = {
  stub: "Stub (local · deterministic)",
  gemini: "Google Gemini",
  openai: "OpenAI",
  deepseek: "DeepSeek",
};

/**
 * Direction of translation. The MVP supports the two directions our
 * bilingual catalog needs; adding e.g. `pt-to-en` would mean adding
 * the literal here and threading the prompt scaffolding through
 * each provider.
 */
export type TranslationDirection = "es-to-en" | "en-to-es";

/**
 * Localized fields the AI providers operate on. Subset of
 * `CaseRecord` — only the editorial content, no media / focus /
 * admin metadata. Keeping this small means prompts stay focused
 * and JSON-schema validation has a small surface.
 */
export interface LocalizedCaseContent {
  title: string;
  description: string;
  /** May be empty. The model is asked to produce 3-5 idiomatic tags
   *  in the target language; we pass the source tags as anchoring
   *  context. */
  tags: string[];
}

export interface TranslateInput {
  /** The source-language content. */
  source: LocalizedCaseContent;
  direction: TranslationDirection;
  /**
   * Few-shot examples drawn from existing high-quality bilingual
   * cases in the catalog. The route handler curates these from
   * cases that already have BOTH slots filled and `reviewed: true`.
   * Empty array is acceptable — the provider falls back to its
   * system prompt alone.
   */
  fewShotExamples?: Array<{
    es: LocalizedCaseContent;
    en: LocalizedCaseContent;
  }>;
}

/**
 * Telemetry returned alongside every AI call. Used for cost
 * tracking, debugging ("which model produced this?"), and the
 * audit trail saved into `case.translationMeta`.
 */
export interface AICallMeta {
  /** Which provider produced this output. */
  provider: ProviderId;
  /** Specific model id (e.g., `gemini-2.5-flash`, `gpt-5-mini`). */
  model: string;
  /** Token usage when the provider reports it. `null` for the stub. */
  promptTokens: number | null;
  completionTokens: number | null;
  /** Wall-clock duration of the API call (ms). */
  durationMs: number;
}

export interface TranslateOutput {
  /** Translated content in the target language. */
  result: LocalizedCaseContent;
  meta: AICallMeta;
}

/**
 * Input for the "editorial rewrite + translate" operation. Different
 * from `TranslateInput`: this is a content TRANSFORMATION, not a
 * language transformation. The AI is asked to rewrite the ES source
 * to fit editorial conventions (title = visible diagnosis, description
 * = US findings only, omit clinical history) AND produce an EN
 * translation of the cleaned ES.
 *
 * Use case (May-2026): admin imports a case with a clinical-narrative
 * description ("Paciente de 45 años con disnea progresiva, niega
 * fiebre, examen físico muestra…") and wants a sonography-focused
 * description ("Múltiples B-líneas confluentes bilaterales, sin
 * derrame pleural significativo.") in BOTH languages, in one click.
 */
export interface RewriteInput {
  /** ES content as input. The rewrite ALWAYS reads from ES — that's
   *  the canonical language of the catalog. EN is regenerated from
   *  the cleaned ES, not from any existing EN slot. If an admin wants
   *  to preserve hand-tuned EN phrasing they should use the manual
   *  review path (the `<AIRewriteModal>` shows the AI suggestion
   *  before saving, so existing EN can be re-applied by editing). */
  source: LocalizedCaseContent;
  /**
   * Optional per-call instruction appended to the editorial system
   * prompt. Lets the admin tell the AI things like "be more concise",
   * "include the probe type if mentioned in the source", or
   * "highlight the differential diagnosis". Plain text; the provider
   * sanitizes / clamps as needed.
   */
  instruction?: string;
}

/**
 * Output of the editorial rewrite. Returns BOTH languages because the
 * operation is "ES + EN in one shot" — a single AI call producing the
 * full bilingual content avoids two round-trips (cheaper) and keeps
 * the languages stylistically consistent (same model context).
 */
export interface RewriteOutput {
  result: {
    /** Cleaned ES content per the editorial rules. */
    es: LocalizedCaseContent;
    /** Translated EN content from the cleaned ES. */
    en: LocalizedCaseContent;
  };
  meta: AICallMeta;
}

/**
 * Result of an availability check. `available: false` carries a
 * human-readable `reason` the UI surfaces in the selector tooltip
 * (e.g., "Set GEMINI_API_KEY in the Netlify env to enable").
 */
export type AvailabilityCheck = { available: true } | { available: false; reason: string };

/**
 * Every concrete provider implements this. New methods (polish,
 * classify, find-duplicates) get added here as we ship them; each
 * provider then has to grow its implementation. TypeScript catches
 * the gap at compile time — no "silent missing feature".
 */
export interface AIProvider {
  /** Stable id used in URLs, env vars, and persisted metadata. */
  readonly id: ProviderId;
  /** Display name surfaced in the admin UI. */
  readonly displayName: string;
  /**
   * Server-side check: is this provider configured to actually be
   * called? Typically tests for the presence of an API key env var.
   * The stub always returns `{ available: true }`.
   *
   * Called at every list-providers request — kept synchronous +
   * cheap (just env-var reads) so it's free to call frequently.
   */
  isAvailable(): AvailabilityCheck;
  /**
   * Translate a case's editorial content between ES and EN.
   *
   * Contract:
   *   - The returned `result` MUST keep the same shape as
   *     `input.source` (title string, description string, tags array
   *     of strings). Zod validation enforces this at the route
   *     boundary.
   *   - `meta.provider` MUST equal `this.id`.
   *   - Token counts: `null` is acceptable when the underlying
   *     model doesn't report them (some local providers, the stub).
   */
  translate(input: TranslateInput): Promise<TranslateOutput>;
  /**
   * Editorial rewrite: takes ES content, returns CLEANED ES + EN
   * versions following the catalog's editorial conventions (title =
   * visible diagnosis, description = US findings only, tags = clinical
   * idioms). See `RewriteInput` for the use case.
   *
   * Contract:
   *   - The returned `result.es` and `result.en` MUST both be valid
   *     `LocalizedCaseContent` shapes (title string, description
   *     string, tags array of strings, 3-5 tags each).
   *   - `meta.provider` MUST equal `this.id`.
   *   - The system prompt encodes the editorial rules; the provider
   *     is responsible for appending `input.instruction` (if present)
   *     after the system prompt so the user override comes last and
   *     therefore wins on conflicts.
   */
  rewriteCase(input: RewriteInput): Promise<RewriteOutput>;
}

/**
 * Server-side error thrown when a provider is invoked but isn't
 * available (missing env var, network problem, etc.). The route
 * handler catches and returns a structured 503 so the UI can
 * surface a meaningful message instead of a generic 500.
 */
export class ProviderUnavailableError extends Error {
  constructor(
    public readonly providerId: ProviderId,
    public readonly reason: string,
  ) {
    super(`Provider "${providerId}" unavailable: ${reason}`);
    this.name = "ProviderUnavailableError";
  }
}
