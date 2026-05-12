"use client";

// AI Suggestions panel — mounted as the fourth tab inside CaseForm.
//
// Flow:
//
//   1. Admin picks a provider in `AIProviderSelector` (defaults to
//      the server-resolved default, persisted in localStorage).
//   2. Admin clicks "Translate ES → EN" or "Translate EN → ES"
//      based on which slot they're filling.
//   3. The panel POSTs to `/api/admin/ai/translate` with the
//      current case's ES (or EN) content as source.
//   4. While the request is in flight, the action buttons disable
//      and a loader appears.
//   5. On success, the panel renders a diff view: current target-
//      language content alongside the AI suggestion, per field
//      (title / description / tags).
//   6. Admin clicks "Apply" per field — that updates the form's
//      target slot AND stamps `translationMeta` so the audit knows
//      this is AI-generated and is awaiting review.
//   7. Admin can also "Discard" the suggestion or edit it inline
//      before applying.
//
// The panel never auto-applies. The whole point of the
// suggestions-not-auto pattern is that the admin's eye is the
// quality gate.

import { useCallback, useState } from "react";
import type { CaseRecord, TranslationMeta } from "@/lib/types";
import { useAIProvider, type AIProviderId } from "@/hooks/useAIProvider";
import { AIProviderSelector } from "./AIProviderSelector";

interface Props {
  form: CaseRecord;
  update: (patch: Partial<CaseRecord>) => void;
}

interface TranslationResult {
  result: { title: string; description: string; tags: string[] };
  meta: {
    provider: AIProviderId;
    model: string;
    promptTokens: number | null;
    completionTokens: number | null;
    durationMs: number;
  };
}

type Direction = "es-to-en" | "en-to-es";

interface PanelState {
  /** Last successful translation result, awaiting review. */
  suggestion: TranslationResult | null;
  /** Which direction the displayed suggestion translates. */
  direction: Direction | null;
  /** Network / provider error from the most recent request. */
  error: string | null;
  /** Whether a translation request is in flight. */
  loading: boolean;
  /** Per-field local edits the admin made before clicking Apply.
   *  Initialized to the suggestion when one lands; the admin can
   *  edit each field freely before committing. */
  edits: { title: string; description: string; tags: string } | null;
}

export function AISuggestionsPanel({ form, update }: Props) {
  const providerState = useAIProvider();
  const [state, setState] = useState<PanelState>({
    suggestion: null,
    direction: null,
    error: null,
    loading: false,
    edits: null,
  });

  const hasES = form.title.es.trim().length > 0 || form.description.es.trim().length > 0;
  const hasEN =
    (form.title.en?.trim().length ?? 0) > 0 || (form.description.en?.trim().length ?? 0) > 0;

  const runTranslate = useCallback(
    async (direction: Direction) => {
      if (!providerState.selectedId) return;
      const source =
        direction === "es-to-en"
          ? {
              title: form.title.es,
              description: form.description.es,
              tags: form.tags.es,
            }
          : {
              title: form.title.en ?? "",
              description: form.description.en ?? "",
              tags: form.tags.en ?? [],
            };
      // Validate source has something to translate. The route
      // handler also validates, but bailing here avoids a useless
      // round-trip + a more obvious UI error.
      if (!source.title.trim() || !source.description.trim()) {
        setState((s) => ({
          ...s,
          error:
            direction === "es-to-en"
              ? "ES title + description must be filled before translating."
              : "EN title + description must be filled before translating.",
          loading: false,
        }));
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetch("/api/admin/ai/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: providerState.selectedId,
            direction,
            source,
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const reason = payload?.reason || payload?.error || `HTTP ${res.status}`;
          throw new Error(reason);
        }
        const data: TranslationResult = await res.json();
        setState({
          suggestion: data,
          direction,
          error: null,
          loading: false,
          edits: {
            title: data.result.title,
            description: data.result.description,
            tags: data.result.tags.join(", "),
          },
        });
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [form, providerState.selectedId],
  );

  const apply = useCallback(() => {
    if (!state.suggestion || !state.direction || !state.edits) return;
    const tags = state.edits.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const meta: TranslationMeta = {
      aiGenerated: true,
      provider: state.suggestion.meta.provider,
      model: state.suggestion.meta.model,
      generatedAt: new Date().toISOString(),
      // No reviewedAt yet — admin "applied" but the audit's grace
      // window applies. A future "Approve as reviewed" flow can set
      // reviewedAt explicitly; for now apply == accept + queue for
      // review.
    };
    if (state.direction === "es-to-en") {
      update({
        title: { ...form.title, en: state.edits.title },
        description: { ...form.description, en: state.edits.description },
        tags: { ...form.tags, en: tags },
        translationMeta: meta,
      });
    } else {
      update({
        title: { ...form.title, es: state.edits.title },
        description: { ...form.description, es: state.edits.description },
        tags: { ...form.tags, es: tags },
        translationMeta: meta,
      });
    }
    setState({
      suggestion: null,
      direction: null,
      error: null,
      loading: false,
      edits: null,
    });
  }, [state, form, update]);

  const discard = useCallback(() => {
    setState({ suggestion: null, direction: null, error: null, loading: false, edits: null });
  }, []);

  return (
    <div className="ai-suggestions-panel">
      <div className="ai-suggestions-header">
        <h3>AI suggestions</h3>
        <p className="ai-suggestions-intro">
          Generate a translation suggestion. Review the diff, edit if needed, then apply. The target
          slot stores <code>translationMeta.aiGenerated: true</code> until an explicit human review
          marks it as approved.
        </p>
        <AIProviderSelector state={providerState} disabled={state.loading} />
      </div>

      <div className="ai-suggestions-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={!providerState.selectedId || state.loading || !hasES}
          onClick={() => void runTranslate("es-to-en")}
          title={
            !hasES
              ? "Fill in the ES title + description first"
              : "Translate the ES content into the EN slot"
          }
        >
          {state.loading && state.direction === "es-to-en" ? "Translating…" : "Translate ES → EN"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={!providerState.selectedId || state.loading || !hasEN}
          onClick={() => void runTranslate("en-to-es")}
          title={
            !hasEN
              ? "Fill in the EN title + description first"
              : "Translate the EN content into the ES slot"
          }
        >
          {state.loading && state.direction === "en-to-es" ? "Translating…" : "Translate EN → ES"}
        </button>
      </div>

      {state.error && (
        <div className="ai-suggestions-error" role="alert">
          {state.error}
        </div>
      )}

      {state.suggestion && state.direction && state.edits && (
        <div className="ai-suggestions-diff">
          <div className="ai-suggestions-meta">
            <span>
              {state.suggestion.meta.provider} · {state.suggestion.meta.model}
            </span>
            <span>{state.suggestion.meta.durationMs} ms</span>
            {state.suggestion.meta.promptTokens !== null && (
              <span>
                {state.suggestion.meta.promptTokens} in / {state.suggestion.meta.completionTokens}{" "}
                out
              </span>
            )}
          </div>

          <DiffField
            label="Title"
            current={state.direction === "es-to-en" ? (form.title.en ?? "") : form.title.es}
            edits={state.edits.title}
            onChange={(v) =>
              setState((s) => (s.edits ? { ...s, edits: { ...s.edits, title: v } } : s))
            }
          />
          <DiffField
            label="Description"
            current={
              state.direction === "es-to-en" ? (form.description.en ?? "") : form.description.es
            }
            edits={state.edits.description}
            multiline
            onChange={(v) =>
              setState((s) => (s.edits ? { ...s, edits: { ...s.edits, description: v } } : s))
            }
          />
          <DiffField
            label="Tags (comma-separated)"
            current={(state.direction === "es-to-en" ? (form.tags.en ?? []) : form.tags.es).join(
              ", ",
            )}
            edits={state.edits.tags}
            onChange={(v) =>
              setState((s) => (s.edits ? { ...s, edits: { ...s.edits, tags: v } } : s))
            }
          />

          <div className="ai-suggestions-commit">
            <button type="button" className="btn-primary" onClick={apply}>
              Apply suggestion
            </button>
            <button type="button" className="btn-ghost" onClick={discard}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface DiffFieldProps {
  label: string;
  /** What the form currently has in the target slot. */
  current: string;
  /** Editable mirror of the AI suggestion. */
  edits: string;
  /** Whether to render as a textarea. */
  multiline?: boolean;
  onChange: (next: string) => void;
}

function DiffField({ label, current, edits, multiline = false, onChange }: DiffFieldProps) {
  return (
    <div className="ai-suggestions-field">
      <label className="ai-suggestions-field-label">{label}</label>
      <div className="ai-suggestions-field-grid">
        <div className="ai-suggestions-field-side">
          <span className="ai-suggestions-field-tag">Current</span>
          <pre className="ai-suggestions-field-text">{current || <em>(empty)</em>}</pre>
        </div>
        <div className="ai-suggestions-field-side">
          <span className="ai-suggestions-field-tag">Suggested (editable)</span>
          {multiline ? (
            <textarea
              className="ai-suggestions-field-input"
              value={edits}
              onChange={(e) => onChange(e.target.value)}
              rows={5}
            />
          ) : (
            <input
              type="text"
              className="ai-suggestions-field-input"
              value={edits}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
