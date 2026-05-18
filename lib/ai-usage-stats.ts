// Client-side aggregation of AI API usage. Reads the response
// metadata from every AI call the admin fires (rewrite, autotag,
// translate, health) and accumulates tokens + an estimated cost
// per calendar month. Surfaced in `<AIStatusBadge>` as a small
// "$X.XX este mes · N ops" chip.
//
// **Not authoritative.** The provider's billing console is the
// source of truth. This module produces a useful-enough estimate
// based on:
//   - Per-provider per-token rates baked into `COST_PER_K_TOKENS`.
//   - Tokens reported by each call's response meta.
//   - The local timezone month boundary (UTC, simpler — avoids
//     DST edge cases for an estimate).
//
// **Why client-side**: the alternative would be a server endpoint
// that logs every call. Adds infrastructure (logging, persistence,
// auth) for a feature whose main consumer is the same admin who
// just fired the call. Local aggregation is good enough; the
// numbers are eventually wrong if the admin works on multiple
// devices, but the order-of-magnitude truth (am I spending $0.10
// or $10 this month?) is robust to that.
//
// **Persistence**: localStorage. One key per month (`taote.ai.
// usage.2026-05`). Old months stay in storage but are never read —
// they're a cheap audit trail if the admin wants to scroll
// localStorage later. Cleanup is manual; ~30 bytes per month
// stored = irrelevant.

const STORAGE_KEY_PREFIX = "taote.ai.usage.";

/**
 * Per-thousand-token rates by provider id. The "input" rate is for
 * prompt tokens, "output" for completion tokens. Numbers are in USD.
 *
 * Update when the provider changes pricing. The dashboard estimate
 * is only as accurate as this table — a 20% rate change here means
 * a 20% miscount until the table catches up.
 *
 * Sources (May-2026):
 *   - DeepSeek `deepseek-chat`: $0.14 / 1M input, $0.28 / 1M output.
 *   - OpenAI `gpt-5-mini`:      $0.25 / 1M input, $2.00 / 1M output.
 *   - Gemini `gemini-2.5-flash`: $0.075 / 1M input, $0.30 / 1M output.
 *   - Stub: zero — no real network call.
 */
const COST_PER_K_TOKENS: Record<string, { input: number; output: number }> = {
  deepseek: { input: 0.00014, output: 0.00028 },
  openai: { input: 0.00025, output: 0.002 },
  gemini: { input: 0.000075, output: 0.0003 },
  stub: { input: 0, output: 0 },
};

export interface AIUsageStats {
  /** "YYYY-MM" key for the calendar month these stats cover. */
  monthKey: string;
  /** Total successful AI calls during the month. */
  totalCalls: number;
  /** Sum of `meta.promptTokens` across all calls. `null` from the
   *  provider is counted as 0 — some models (and the stub) don't
   *  report it. */
  totalInputTokens: number;
  totalOutputTokens: number;
  /** USD estimate computed from the tokens above using
   *  `COST_PER_K_TOKENS`. */
  estimatedCostUSD: number;
}

function currentMonthKey(): string {
  const now = new Date();
  // UTC to avoid DST edge cases — the estimate is intentionally
  // off-by-a-few-hours at month boundaries. Acceptable.
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function storageKey(monthKey: string): string {
  return `${STORAGE_KEY_PREFIX}${monthKey}`;
}

/**
 * Read the current month's stats, returning a zeroed object when
 * no data is present (first call of the month, or first time the
 * feature runs on this device).
 */
export function getCurrentMonthStats(): AIUsageStats {
  const monthKey = currentMonthKey();
  if (typeof window === "undefined") {
    return blankStats(monthKey);
  }
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(monthKey));
  } catch {
    return blankStats(monthKey);
  }
  if (!raw) return blankStats(monthKey);
  try {
    const parsed = JSON.parse(raw);
    if (isStats(parsed) && parsed.monthKey === monthKey) {
      return parsed;
    }
  } catch {
    // Bad JSON — fall through to blank.
  }
  return blankStats(monthKey);
}

function blankStats(monthKey: string): AIUsageStats {
  return {
    monthKey,
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    estimatedCostUSD: 0,
  };
}

function isStats(v: unknown): v is AIUsageStats {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.monthKey === "string" &&
    typeof obj.totalCalls === "number" &&
    typeof obj.totalInputTokens === "number" &&
    typeof obj.totalOutputTokens === "number" &&
    typeof obj.estimatedCostUSD === "number"
  );
}

/**
 * Record a single AI call. Pass the provider id + tokens from the
 * response meta. `null` token values are treated as 0 — the
 * dashboard says "no data" for those calls rather than crashing.
 *
 * Idempotency: NOT idempotent. Each call increments the counters
 * once. The caller is responsible for not double-recording.
 */
export function recordAICall(
  provider: string,
  promptTokens: number | null,
  completionTokens: number | null,
): void {
  if (typeof window === "undefined") return;
  const current = getCurrentMonthStats();
  const rate = COST_PER_K_TOKENS[provider] ?? { input: 0, output: 0 };
  const inputTokens = promptTokens ?? 0;
  const outputTokens = completionTokens ?? 0;
  const incrementalCost = (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
  const updated: AIUsageStats = {
    monthKey: current.monthKey,
    totalCalls: current.totalCalls + 1,
    totalInputTokens: current.totalInputTokens + inputTokens,
    totalOutputTokens: current.totalOutputTokens + outputTokens,
    estimatedCostUSD: current.estimatedCostUSD + incrementalCost,
  };
  try {
    window.localStorage.setItem(storageKey(current.monthKey), JSON.stringify(updated));
    // Notify same-tab listeners that the stats changed. The badge
    // listens via a custom event because `storage` events only fire
    // cross-tab, not within the writer's own tab.
    window.dispatchEvent(new CustomEvent("taote-ai-usage-updated"));
  } catch {
    // ignore quota errors — the dashboard becomes stale but the
    // call still succeeded.
  }
}

/**
 * Test helper. Production code never needs this — the per-month
 * key rolls forward on its own.
 */
export function clearUsageStatsForTests(): void {
  if (typeof window === "undefined") return;
  // Walk localStorage and remove every key with our prefix.
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(STORAGE_KEY_PREFIX)) keys.push(k);
  }
  for (const k of keys) {
    window.localStorage.removeItem(k);
  }
}

/**
 * Format a USD cost for display ("$0.18", "$1.42", "$0.00").
 * Always 2 decimals, no thousands separator (we don't expect
 * monthly totals over $10 in normal use).
 */
export function formatCostUSD(usd: number): string {
  return `$${usd.toFixed(2)}`;
}
