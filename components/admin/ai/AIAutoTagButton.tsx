"use client";

// Per-row "🏷️ IA tags" button. Lighter than the full ✨ rewrite —
// fires a single POST to /api/admin/ai/autotag, replaces only the
// tag slots (ES + EN), records an undo batch entry, and shows a
// short toast on success / failure.
//
// **Why a button, not a modal**: there's no per-call instruction
// to tune. The operation is deterministic (same title +
// description → similar tags every time), so a confirm modal
// would be pure friction. One click → done.
//
// **Confirmation**: skipped on purpose. If the result is wrong,
// the undo banner picks up this batch entry and reverts it like
// any other AI patch. Cost is ~$0.0005 per call so a misfire is
// trivially cheap.

import { useCallback, useState } from "react";
import { entryFromCase, rememberAIBatch } from "@/lib/ai-batch-undo";
import { recordAICall } from "@/lib/ai-usage-stats";
import { isTransient, withRetry } from "@/lib/errors/retry";
import type { CaseRecord, TranslationMeta } from "@/lib/types";

interface AutoTagResult {
  result: { es: string[]; en: string[] };
  meta: {
    provider: string;
    model: string;
    promptTokens: number | null;
    completionTokens: number | null;
    durationMs: number;
  };
}

function asProviderId(raw: string): TranslationMeta["provider"] {
  return raw as TranslationMeta["provider"];
}

interface Props {
  caso: CaseRecord;
  /** Same patch handler the other AI flows use. The autotag patch
   *  only touches `tags` + `translationMeta`. */
  onApplyPatch: (id: string, patch: Partial<CaseRecord>) => Promise<void> | void;
  /** Optional toast surface. When provided, shows "Tags
   *  regenerados" / error message after the call. */
  onNotify?: (message: string) => void;
}

export function AIAutoTagButton({ caso, onApplyPatch, onNotify }: Props) {
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      // Wrapped in `withRetry` — autotag hits the upstream LLM
      // (DeepSeek), which can return 429 / 503 / network blips
      // under burst load. `isTransient` filters: 4xx (other than
      // 408/429) still fail fast since they signal real client /
      // data errors.
      //
      // Pattern: throw on non-OK so withRetry can decide whether
      // to retry. On final failure we catch + surface the
      // user-friendly detail (the body's `reason` if available,
      // else the HTTP status). The 4xx-with-reason path is the
      // common case for "provider says X is invalid" feedback.
      let res: Response;
      try {
        res = await withRetry(
          async () => {
            const r = await fetch("/api/admin/ai/autotag", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                source: {
                  title: caso.title.es,
                  description: caso.description?.es ?? "",
                },
              }),
            });
            if (!r.ok && isTransient(new Error(`HTTP ${r.status}`))) {
              // Transient — throw so withRetry retries.
              throw new Error(`HTTP ${r.status}`);
            }
            // OK OR a non-transient !ok (e.g. 400). Return as-is
            // so the outer handler can extract the body reason.
            return r;
          },
          {
            shouldRetry: (err, attempt) => attempt < 2 && isTransient(err),
            area: "ai-autotag",
          },
        );
      } catch (err) {
        const detail = err instanceof Error ? err.message : "unknown";
        onNotify?.(`Error en autotag: ${detail}`);
        return;
      }
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody.reason) detail = errBody.reason;
        } catch {
          // ignore parse failure
        }
        onNotify?.(`Error en autotag: ${detail}`);
        return;
      }
      const data: AutoTagResult = await res.json();
      // Record for the cost-dashboard chip in the AI status badge.
      recordAICall(data.meta.provider, data.meta.promptTokens, data.meta.completionTokens);
      // Snapshot BEFORE state into the undo buffer. The auto-tag
      // patch is reversible like any other AI batch entry.
      rememberAIBatch("rewrite", [entryFromCase(caso)]);
      await onApplyPatch(caso.id, {
        tags: { es: data.result.es, en: data.result.en },
        // Marks the case as AI-touched so the "Estado IA" filter
        // surfaces it. The auto-tag operation is an unreviewed
        // path by design (no confirm dialog) so reviewedAt stays
        // undefined — admin can sweep the queue later.
        translationMeta: {
          aiGenerated: true,
          provider: asProviderId(data.meta.provider),
          model: data.meta.model,
          generatedAt: new Date().toISOString(),
        },
      });
      onNotify?.(`Tags regenerados (${data.meta.durationMs} ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onNotify?.(`Error en autotag: ${msg}`);
    } finally {
      setRunning(false);
    }
  }, [caso, onApplyPatch, onNotify]);

  return (
    <button
      type="button"
      className="bulk-edit-row-autotag"
      onClick={run}
      disabled={running}
      aria-label={`Regenerar tags con IA para "${caso.title.es}"`}
      title="Regenerar solo tags con IA (ES + EN) — operación liviana, sin paso de revisión"
    >
      {running ? "…" : "🏷️"}
    </button>
  );
}
