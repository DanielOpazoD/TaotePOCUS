"use client";

// Provider picker for the AI suggestions panel. Renders the four
// providers (stub, Gemini, OpenAI, DeepSeek) as a single `<select>`
// with availability reflected per-option:
//
//   - Available providers are picker-enabled.
//   - Unavailable providers render as disabled `<option>`s with a
//     suffix explaining why ("· set GEMINI_API_KEY"). Keeps every
//     supported provider visible so the admin knows what's possible
//     without digging through docs.
//
// The chosen id is owned by `useAIProvider` (localStorage-backed).
// This component just renders + dispatches the change.

import type { UseAIProvider } from "@/hooks/useAIProvider";

interface Props {
  /** Output of the `useAIProvider()` hook. Passed in rather than
   *  consumed here so callers control when the hook fires (e.g.,
   *  inside a panel that mounts conditionally). */
  state: UseAIProvider;
  /** Optional label override; defaults to "AI provider". Surfaced
   *  for the i18n dictionary when the panel uses `t()`. */
  label?: string;
  /** Disable the selector while a translation request is in flight
   *  so the admin can't swap providers mid-call. */
  disabled?: boolean;
}

export function AIProviderSelector({ state, label = "AI provider", disabled = false }: Props) {
  const { snapshot, loading, selectedId, setSelectedId } = state;
  if (loading) {
    return (
      <div className="ai-provider-selector ai-provider-selector--loading">
        <span className="ai-provider-selector-label">{label}</span>
        <span className="ai-provider-selector-status">…</span>
      </div>
    );
  }
  if (!snapshot) {
    // Error path: registry fetch failed (typically 403 when session
    // expired). Display state with no usable options. The parent
    // panel surfaces the underlying error message separately.
    return (
      <div className="ai-provider-selector ai-provider-selector--error">
        <span className="ai-provider-selector-label">{label}</span>
        <span className="ai-provider-selector-status">unavailable</span>
      </div>
    );
  }

  return (
    <label className="ai-provider-selector">
      <span className="ai-provider-selector-label">{label}</span>
      <select
        className="ai-provider-selector-select"
        value={selectedId ?? snapshot.defaultId}
        onChange={(e) => setSelectedId(e.target.value as typeof selectedId & string)}
        disabled={disabled}
      >
        {snapshot.providers.map((p) => {
          const isAvailable = p.availability.available;
          const suffix = isAvailable
            ? ""
            : ` · ${"reason" in p.availability ? p.availability.reason : "unavailable"}`;
          return (
            <option key={p.id} value={p.id} disabled={!isAvailable}>
              {p.displayName}
              {suffix}
            </option>
          );
        })}
      </select>
    </label>
  );
}
