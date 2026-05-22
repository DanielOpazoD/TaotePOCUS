// Exponential-backoff retry for transient network failures. Pure
// utility — no Sentry / Toast integration here; the caller decides
// what to surface to the user when retries are exhausted.
//
// Why we needed this: the codebase had a couple of places that
// retried via for-loops with hardcoded delays (the LRU eviction
// path in the offline-cases SW message handler, the AI batch
// retry). Each was slightly different in backoff strategy and
// none honored AbortSignal. Consolidating means one shape we
// can reason about + test.
//
// Anti-pattern this helper rejects: retrying on a non-transient
// error (4xx, "user denied permission", quota errors). Callers
// should pre-filter: only wrap calls whose failure is genuinely
// "try again later" — typically network glitches and rate
// limiting (429 / 503).

import { log } from "@/lib/log";

export interface RetryOptions {
  /** Maximum number of attempts INCLUDING the initial try. Default 3.
   *  e.g. maxAttempts=3 → try once, retry up to 2 more times. */
  maxAttempts?: number;
  /** Base delay between attempts in ms. Default 200ms. Each retry
   *  multiplies this by `backoffFactor ** retryIndex`, so:
   *    base=200, factor=2 → 200, 400, 800
   *    base=100, factor=3 → 100, 300, 900
   *  Jitter (±25%) is applied to spread thundering-herd scenarios. */
  baseDelayMs?: number;
  /** Multiplier per retry. Default 2 (canonical exponential). */
  backoffFactor?: number;
  /** Hard cap on total elapsed wait time (sum of delays) in ms.
   *  Defaults to 10s. Protects against a slow caller mistakenly
   *  setting maxAttempts very high. */
  maxTotalDelayMs?: number;
  /** Predicate to decide whether a given error is worth retrying.
   *  Default: retry every error. Callers should narrow this to
   *  transient-only errors (e.g. network, 429, 503) in real use. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Optional AbortSignal — if it triggers between attempts, the
   *  helper rethrows the user's reason instead of continuing. The
   *  in-flight call itself is NOT cancelled (that's the caller's
   *  responsibility — fetch with the same signal, etc.). */
  signal?: AbortSignal;
  /** Tag for log forwarding. When set, retries are reported as
   *  warnings with `area`-tagged context so the admin RUM /
   *  Sentry feed can see "feature X retried twice before
   *  succeeding". */
  area?: string;
}

/**
 * Run `fn` with exponential-backoff retries. Returns the resolved
 * value on first success; rethrows the LAST error if every
 * attempt fails.
 *
 * Example:
 *   const result = await withRetry(
 *     () => fetch("/api/...").then((r) => {
 *       if (!r.ok) throw new Error(`HTTP ${r.status}`);
 *       return r.json();
 *     }),
 *     { maxAttempts: 3, area: "case-save" }
 *   );
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const backoffFactor = options.backoffFactor ?? 2;
  const maxTotalDelayMs = options.maxTotalDelayMs ?? 10_000;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: unknown;
  let elapsedDelay = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error("aborted");
    }
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt || !shouldRetry(err, attempt)) {
        if (options.area) {
          log.warn(
            "retry-exhausted",
            { area: options.area, attempts: attempt + 1, maxAttempts },
            err,
          );
        }
        throw err;
      }
      // Exponential backoff with ±25% jitter to spread bursts.
      const raw = baseDelayMs * Math.pow(backoffFactor, attempt);
      const jitter = raw * (0.75 + Math.random() * 0.5);
      const delay = Math.min(jitter, maxTotalDelayMs - elapsedDelay);
      if (delay <= 0) {
        // The total-delay budget is exhausted. Treat as a final
        // attempt and rethrow.
        if (options.area) {
          log.warn(
            "retry-budget-exhausted",
            { area: options.area, attempts: attempt + 1, maxAttempts, maxTotalDelayMs },
            err,
          );
        }
        throw err;
      }
      elapsedDelay += delay;
      if (options.area) {
        log.debug("retry-pending", {
          area: options.area,
          attempt: attempt + 1,
          delayMs: Math.round(delay),
        });
      }
      await sleep(delay, options.signal);
    }
  }
  // Unreachable: the loop either returns the success value or
  // throws on the final attempt. Defensive throw to satisfy TS.
  throw lastError;
}

/** Promise-based sleep that aborts cleanly when the signal trips. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(signal?.reason ?? new Error("aborted"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort);
  });
}

/** Default predicate for "is this error worth retrying?".
 *  Includes:
 *   - TypeError (network failure thrown by fetch)
 *   - HTTP 408 / 429 / 500-599 (server-side transient)
 *   - DOMException with name "NetworkError"
 *
 *  Excludes:
 *   - 4xx (except 408/429) — client errors, retrying won't help
 *   - AbortError / quota / permission — user / browser said no
 *
 *  Callers can compose: `shouldRetry: (e) => isTransient(e) && !isAuthError(e)`. */
export function isTransient(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch network failure
  if (err instanceof DOMException && err.name === "NetworkError") return true;
  if (err instanceof Error) {
    // Common shape: `new Error("HTTP 503")` from a fetch wrapper.
    const match = err.message.match(/HTTP\s+(\d+)/);
    if (match && match[1]) {
      const status = Number(match[1]);
      return status === 408 || status === 429 || (status >= 500 && status < 600);
    }
  }
  return false;
}
