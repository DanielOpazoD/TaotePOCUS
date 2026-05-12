// Provider registry. Single source of truth for which AI providers
// the app knows about and which are currently usable. Used by:
//
//   - `/api/admin/ai/providers/route.ts` → returns the availability
//     map for the admin selector to render.
//   - `/api/admin/ai/translate/route.ts` → dispatches the request
//     to the chosen provider after validating it's available.
//
// Adding a new provider means:
//   1. Implement `AIProvider` in a new file under `lib/ai/`.
//   2. Add the literal id to `ProviderId` in `provider.ts`.
//   3. Append the new instance to `ALL_PROVIDERS` below.
//
// The order in `ALL_PROVIDERS` is the resolution order for the
// "first available" default: `gemini > openai > deepseek > stub`.
// Local dev with no env vars → falls through to `stub` (always
// available). Netlify with `GEMINI_API_KEY` set → `gemini` wins.

import type { AIProvider, AvailabilityCheck, ProviderId } from "./provider";
import { stubProvider } from "./stub";
import { geminiProvider } from "./gemini";
import { openaiProvider, deepseekProvider } from "./openai-compat";

/**
 * Every provider the app knows about, in default-resolution order.
 * The first one whose `isAvailable()` returns `{ available: true }`
 * becomes the default for new admin sessions (admins can override
 * per-call via the UI selector).
 */
export const ALL_PROVIDERS: ReadonlyArray<AIProvider> = [
  geminiProvider,
  openaiProvider,
  deepseekProvider,
  stubProvider,
];

/**
 * Lookup by id. Used by the route handler to dispatch the request
 * to the right concrete provider after parsing the `provider` query
 * param / header from the client.
 *
 * Returns `null` for unknown ids — the handler converts that to a
 * 400 so the client UI can surface "Unknown provider 'foo'".
 */
export function getProvider(id: ProviderId): AIProvider | null {
  return ALL_PROVIDERS.find((p) => p.id === id) ?? null;
}

/**
 * Resolve the default provider for a new admin session: the first
 * one in `ALL_PROVIDERS` whose `isAvailable()` returns true. The
 * order means real providers win over the stub when their keys
 * are configured.
 *
 * Explicit override via `AI_PROVIDER_DEFAULT` env var skips the
 * resolution and forces a specific id (still checked for
 * availability). Useful for a Netlify env where you have multiple
 * keys set but want to pin which one is default.
 */
export function resolveDefaultProvider(): AIProvider {
  const explicit = process.env.AI_PROVIDER_DEFAULT;
  if (explicit) {
    const provider = getProvider(explicit as ProviderId);
    if (provider && provider.isAvailable().available) return provider;
    // Fall through to the resolution order if the env-specified
    // provider isn't actually available (typo, key missing, etc.).
  }
  for (const provider of ALL_PROVIDERS) {
    if (provider.isAvailable().available) return provider;
  }
  // The stub is always available — by construction, this never
  // throws. But TypeScript doesn't know that, so we narrow with a
  // defensive return.
  return stubProvider;
}

/**
 * Snapshot of the availability map. Returned by
 * `/api/admin/ai/providers` so the admin selector UI can render
 * available + unavailable providers with their tooltips.
 *
 * `defaultId` reflects what `resolveDefaultProvider()` would pick
 * right now — clients can pre-select that in the UI when the admin
 * hasn't picked a provider yet.
 */
export interface ProviderSnapshot {
  id: ProviderId;
  displayName: string;
  availability: AvailabilityCheck;
}

export interface RegistrySnapshot {
  defaultId: ProviderId;
  providers: ProviderSnapshot[];
}

export function snapshotRegistry(): RegistrySnapshot {
  return {
    defaultId: resolveDefaultProvider().id,
    providers: ALL_PROVIDERS.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      availability: p.isAvailable(),
    })),
  };
}
