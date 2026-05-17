"use client";

// Bulk AI editorial rewrite modal. Opened from the BulkEditTable's
// action bar when N rows are selected. No per-case review path —
// review would require N modal presentations which defeats the
// "fast batch" workflow this is for. Two safety gates instead:
//
//   1. Explicit confirmation: "this will make N AI calls (~$X)".
//   2. Progress UI: the admin sees each case complete so they can
//      cancel mid-way if the early outputs look wrong.
//
// Errors per case are non-fatal: a single failure doesn't abort
// the batch. At the end the admin sees a summary "N succeeded, M
// failed" and can retry the failed ones via the per-row ✨ modal.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CaseRecord, LocalizedString } from "@/lib/types";

const INSTRUCTION_STORAGE_KEY = "taote.ai.rewrite.instruction";
const INSTRUCTION_MAX_CHARS = 500;
// Roughly how much one rewrite costs on DeepSeek with the default
// `deepseek-chat` model at ~3000 combined tokens. Surfaced in the
// confirmation step so the admin sees an estimate before committing.
const COST_PER_CALL_USD_ESTIMATE = 0.0015;

interface AIRewriteResult {
  result: {
    es: { title: string; description: string; tags: string[] };
    en: { title: string; description: string; tags: string[] };
  };
  meta: { model: string; durationMs: number };
}

interface Props {
  cases: CaseRecord[];
  /** Same signature as BulkEditTable's onPatch. The bulk modal calls
   *  it once per case as each rewrite completes — gives the admin
   *  partial progress feedback (cases turn green in the table as they
   *  land) rather than a single all-or-nothing apply at the end. */
  onApplyPatch: (id: string, patch: Partial<CaseRecord>) => Promise<void> | void;
  onClose: () => void;
}

type Phase =
  | { kind: "configure" }
  | { kind: "confirming" }
  | { kind: "running"; done: number; failures: Array<{ id: string; error: string }> }
  | { kind: "complete"; succeeded: number; failures: Array<{ id: string; error: string }> };

function readPersistedInstruction(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(INSTRUCTION_STORAGE_KEY);
    return typeof raw === "string" ? raw.slice(0, INSTRUCTION_MAX_CHARS) : "";
  } catch {
    return "";
  }
}

function persistInstruction(value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INSTRUCTION_STORAGE_KEY, value.slice(0, INSTRUCTION_MAX_CHARS));
  } catch {
    // ignore quota errors
  }
}

export function AIBulkRewriteModal({ cases, onApplyPatch, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "configure" });
  const [instruction, setInstruction] = useState<string>(() => readPersistedInstruction());
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Used to short-circuit the batch loop when the admin cancels
  // mid-flight. The loop checks this every iteration.
  const cancelRef = useRef<boolean>(false);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (!dlg.open) dlg.showModal();
    return () => {
      if (dlg.open) dlg.close();
    };
  }, []);

  useEffect(() => {
    persistInstruction(instruction);
  }, [instruction]);

  const runBatch = useCallback(async () => {
    cancelRef.current = false;
    const failures: Array<{ id: string; error: string }> = [];
    setPhase({ kind: "running", done: 0, failures });

    for (let i = 0; i < cases.length; i++) {
      if (cancelRef.current) break;
      const c = cases[i]!;
      try {
        const res = await fetch("/api/admin/ai/rewrite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: {
              title: c.title.es,
              description: c.description?.es ?? "",
              tags: c.tags.es,
            },
            instruction: instruction.trim() || undefined,
          }),
        });
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const errBody = await res.json();
            if (errBody.reason) detail = errBody.reason;
          } catch {
            // ignore
          }
          failures.push({ id: c.id, error: detail });
          setPhase({ kind: "running", done: i + 1, failures: [...failures] });
          continue;
        }
        const data: AIRewriteResult = await res.json();
        const patch: Partial<CaseRecord> = {
          title: {
            es: data.result.es.title,
            en: data.result.en.title,
          } satisfies LocalizedString,
          description: {
            es: data.result.es.description,
            en: data.result.en.description,
          } satisfies LocalizedString,
          tags: { es: data.result.es.tags, en: data.result.en.tags },
        };
        await onApplyPatch(c.id, patch);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ id: c.id, error: message });
      }
      setPhase({ kind: "running", done: i + 1, failures: [...failures] });
    }

    setPhase({
      kind: "complete",
      succeeded: cases.length - failures.length,
      failures,
    });
  }, [cases, instruction, onApplyPatch]);

  const onCancelInFlight = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return (
    <dialog ref={dialogRef} className="ai-rewrite-dialog" aria-labelledby="ai-bulk-rewrite-title">
      <div className="ai-rewrite-shell">
        <header className="ai-rewrite-head">
          <h2 id="ai-bulk-rewrite-title">✨ Reescribir {cases.length} casos con IA</h2>
          <button
            type="button"
            className="ai-rewrite-close"
            onClick={onClose}
            aria-label="Cerrar"
            disabled={phase.kind === "running"}
          >
            ×
          </button>
        </header>

        {phase.kind === "configure" && (
          <>
            <p className="ai-rewrite-intro">
              La IA va a reescribir <strong>{cases.length}</strong> casos siguiendo las reglas
              editoriales (título = diagnóstico visible, descripción = solo hallazgos ecográficos,
              tags clínicos en ES + EN). Los cambios se guardan a medida que cada caso completa — no
              hay revisión por caso en modo bulk.
            </p>
            <label className="ai-rewrite-instruction-label" htmlFor="ai-bulk-instruction">
              Instrucción adicional (opcional, se aplica a todos los casos)
            </label>
            <textarea
              id="ai-bulk-instruction"
              className="ai-rewrite-instruction"
              placeholder="Ej: 'más conciso', 'incluí transductor', 'enfatizá diagnóstico diferencial'"
              value={instruction}
              maxLength={INSTRUCTION_MAX_CHARS}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
            />
            <small className="ai-rewrite-instruction-hint">
              <span className="ai-rewrite-instruction-count">
                {instruction.length} / {INSTRUCTION_MAX_CHARS}
              </span>
            </small>
            <div className="ai-rewrite-actions">
              <button
                type="button"
                className="ai-rewrite-action ai-rewrite-action--direct"
                onClick={() => setPhase({ kind: "confirming" })}
              >
                Continuar
              </button>
              <button
                type="button"
                className="ai-rewrite-action ai-rewrite-action--cancel"
                onClick={onClose}
              >
                Cancelar
              </button>
            </div>
          </>
        )}

        {phase.kind === "confirming" && (
          <div className="ai-rewrite-confirm">
            <p>
              ¿Generar y guardar <strong>{cases.length} casos</strong> sin revisión por caso?
            </p>
            <p className="ai-rewrite-confirm-detail">
              Estimación: ~{cases.length * 5}-{cases.length * 10} segundos. Costo aproximado: ~$
              {(COST_PER_CALL_USD_ESTIMATE * cases.length).toFixed(3)} USD. Los fallos individuales
              no abortan el batch — al final ves un resumen.
            </p>
            <div className="ai-rewrite-actions">
              <button
                type="button"
                className="ai-rewrite-action ai-rewrite-action--direct"
                onClick={runBatch}
              >
                Sí, generar {cases.length} casos
              </button>
              <button
                type="button"
                className="ai-rewrite-action ai-rewrite-action--cancel"
                onClick={() => setPhase({ kind: "configure" })}
              >
                Volver
              </button>
            </div>
          </div>
        )}

        {phase.kind === "running" && (
          <div className="ai-rewrite-progress" role="status" aria-live="polite">
            <div className="ai-rewrite-progress-label">
              Procesando {phase.done} / {cases.length}
              {phase.failures.length > 0 && (
                <span className="ai-rewrite-progress-fail-count">
                  ({phase.failures.length} fallos)
                </span>
              )}
            </div>
            <div className="ai-rewrite-progress-bar" aria-hidden="true">
              <div
                className="ai-rewrite-progress-fill"
                style={{ width: `${(phase.done / cases.length) * 100}%` }}
              />
            </div>
            <div className="ai-rewrite-actions">
              <button
                type="button"
                className="ai-rewrite-action ai-rewrite-action--cancel"
                onClick={onCancelInFlight}
              >
                Cancelar después del actual
              </button>
            </div>
          </div>
        )}

        {phase.kind === "complete" && (
          <div className="ai-rewrite-complete">
            <p>
              <strong>{phase.succeeded}</strong> casos actualizados.{" "}
              {phase.failures.length > 0 && (
                <span className="ai-rewrite-complete-fail">
                  {phase.failures.length} fallaron — abrí cada uno con el botón ✨ por fila para
                  reintentarlos.
                </span>
              )}
            </p>
            {phase.failures.length > 0 && (
              <ul className="ai-rewrite-complete-fail-list">
                {phase.failures.slice(0, 5).map((f) => (
                  <li key={f.id}>
                    <code>{f.id}</code>: {f.error}
                  </li>
                ))}
                {phase.failures.length > 5 && <li>… y {phase.failures.length - 5} más</li>}
              </ul>
            )}
            <div className="ai-rewrite-actions">
              <button
                type="button"
                className="ai-rewrite-action ai-rewrite-action--direct"
                onClick={onClose}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
