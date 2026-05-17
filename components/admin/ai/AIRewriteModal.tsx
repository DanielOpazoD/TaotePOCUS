"use client";

// Per-case AI editorial rewrite modal. Opened from the BulkEditTable
// row ⋮ menu or the per-row ✨ button. Two output paths:
//
//   1. "Generar y revisar"  → AI produces ES + EN suggestions; the
//      admin sees them in editable fields, can tweak each one,
//      then clicks "Aplicar" to commit via `onApplyPatch`.
//   2. "Generar y guardar"  → confirmation dialog → AI produces ES
//      + EN suggestions → patch applied immediately via
//      `onApplyPatch`, modal closes.
//
// Both paths share the same `/api/admin/ai/rewrite` call. The
// difference is whether we render a review UI before the commit.
//
// The instruction textarea persists in localStorage so an admin
// who's iterating ("be more concise", "include the probe type")
// doesn't lose their tuning between cases. The persistence is
// session-local — cloud sync is a separate follow-up (see TODO
// at the localStorage call sites).

import { useCallback, useEffect, useRef, useState } from "react";
import type { CaseRecord, LocalizedString } from "@/lib/types";

const INSTRUCTION_STORAGE_KEY = "taote.ai.rewrite.instruction";
const INSTRUCTION_MAX_CHARS = 500;

interface AIRewriteResult {
  result: {
    es: { title: string; description: string; tags: string[] };
    en: { title: string; description: string; tags: string[] };
  };
  meta: {
    provider: string;
    model: string;
    promptTokens: number | null;
    completionTokens: number | null;
    durationMs: number;
  };
}

interface Props {
  /** Case being rewritten. ES slot is the AI's input. */
  caso: CaseRecord;
  /** Apply the resulting patch — same signature as BulkEditTable's
   *  onPatch. The patch carries `title`, `description`, and `tags`
   *  in `LocalizedString` shape (ES + EN slots filled). */
  onApplyPatch: (id: string, patch: Partial<CaseRecord>) => Promise<void> | void;
  /** Close the modal. Called after a successful apply OR a discard. */
  onClose: () => void;
}

type Phase =
  // Editing the instruction and choosing a path.
  | { kind: "configure" }
  // Awaiting a single rewrite call.
  | { kind: "loading"; pathAfterLoad: "review" | "save-direct" }
  // Showing the AI suggestion with editable fields for the admin
  // to review + commit.
  | { kind: "review"; result: AIRewriteResult }
  // Auto-save path: user has confirmed, AI is running, will apply
  // immediately on success.
  | { kind: "confirming-save-direct" }
  // Terminal error state. The user can retry or close.
  | { kind: "error"; message: string };

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
    // localStorage full / disabled — ignore. The instruction is
    // a convenience, not load-bearing for the feature.
  }
  // TODO (phase 2): mirror to cloud via a new repo method so the
  // instruction follows the admin across devices.
}

export function AIRewriteModal({ caso, onApplyPatch, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "configure" });
  const [instruction, setInstruction] = useState<string>(() => readPersistedInstruction());
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Editable copies of the AI suggestion. Filled when phase becomes
  // "review" and copied back into the patch on Aplicar.
  const [editEsTitle, setEditEsTitle] = useState("");
  const [editEsDescription, setEditEsDescription] = useState("");
  const [editEsTags, setEditEsTags] = useState("");
  const [editEnTitle, setEditEnTitle] = useState("");
  const [editEnDescription, setEditEnDescription] = useState("");
  const [editEnTags, setEditEnTags] = useState("");

  // Open the native dialog on mount, close on unmount (mirrors the
  // pattern used by the rest of the app's `<dialog>` consumers).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (!dlg.open) dlg.showModal();
    return () => {
      if (dlg.open) dlg.close();
    };
  }, []);

  // Persist instruction changes (debounced via React's batching —
  // every keystroke writes, but localStorage writes are fast and
  // synchronous so a debounce here would add complexity without
  // measurable benefit).
  useEffect(() => {
    persistInstruction(instruction);
  }, [instruction]);

  const runRewrite = useCallback(
    async (pathAfterLoad: "review" | "save-direct"): Promise<AIRewriteResult | null> => {
      setPhase({ kind: "loading", pathAfterLoad });
      try {
        const res = await fetch("/api/admin/ai/rewrite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: {
              title: caso.title.es,
              description: caso.description?.es ?? "",
              tags: caso.tags.es,
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
            // ignore parse error; default message is enough
          }
          setPhase({ kind: "error", message: detail });
          return null;
        }
        const data: AIRewriteResult = await res.json();
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setPhase({ kind: "error", message: msg });
        return null;
      }
    },
    [caso.title.es, caso.description, caso.tags.es, instruction],
  );

  const onGenerateAndReview = useCallback(async () => {
    const data = await runRewrite("review");
    if (!data) return;
    setEditEsTitle(data.result.es.title);
    setEditEsDescription(data.result.es.description);
    setEditEsTags(data.result.es.tags.join(", "));
    setEditEnTitle(data.result.en.title);
    setEditEnDescription(data.result.en.description);
    setEditEnTags(data.result.en.tags.join(", "));
    setPhase({ kind: "review", result: data });
  }, [runRewrite]);

  const onGenerateAndSaveDirect = useCallback(() => {
    // Move to confirmation; the actual call fires from the confirm
    // dialog's "Sí, generar y guardar" button below.
    setPhase({ kind: "confirming-save-direct" });
  }, []);

  const onConfirmSaveDirect = useCallback(async () => {
    const data = await runRewrite("save-direct");
    if (!data) return;
    // Build the patch directly from the AI output (no review step).
    const patch: Partial<CaseRecord> = {
      title: {
        es: data.result.es.title,
        en: data.result.en.title,
      } satisfies LocalizedString,
      description: {
        es: data.result.es.description,
        en: data.result.en.description,
      } satisfies LocalizedString,
      tags: {
        es: data.result.es.tags,
        en: data.result.en.tags,
      },
    };
    await onApplyPatch(caso.id, patch);
    onClose();
  }, [runRewrite, onApplyPatch, caso.id, onClose]);

  const onApplyFromReview = useCallback(async () => {
    // Build the patch from the (possibly admin-edited) review fields.
    // Tags are split on commas, trimmed, and dropped if empty.
    const parseTags = (s: string) =>
      s
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    const patch: Partial<CaseRecord> = {
      title: {
        es: editEsTitle.trim(),
        en: editEnTitle.trim(),
      } satisfies LocalizedString,
      description: {
        es: editEsDescription.trim(),
        en: editEnDescription.trim(),
      } satisfies LocalizedString,
      tags: {
        es: parseTags(editEsTags),
        en: parseTags(editEnTags),
      },
    };
    await onApplyPatch(caso.id, patch);
    onClose();
  }, [
    editEsTitle,
    editEnTitle,
    editEsDescription,
    editEnDescription,
    editEsTags,
    editEnTags,
    onApplyPatch,
    caso.id,
    onClose,
  ]);

  return (
    <dialog ref={dialogRef} className="ai-rewrite-dialog" aria-labelledby="ai-rewrite-title">
      <div className="ai-rewrite-shell">
        <header className="ai-rewrite-head">
          <h2 id="ai-rewrite-title">✨ Reescribir con IA</h2>
          <button type="button" className="ai-rewrite-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="ai-rewrite-source">
          <div className="ai-rewrite-source-label">Caso actual (ES)</div>
          <div className="ai-rewrite-source-title">{caso.title.es}</div>
          <div className="ai-rewrite-source-desc">
            {caso.description?.es || <em>(sin descripción)</em>}
          </div>
        </div>

        {/* Configure phase: instruction + two action buttons. */}
        {phase.kind === "configure" && (
          <>
            <label className="ai-rewrite-instruction-label" htmlFor="ai-rewrite-instruction">
              Instrucción adicional (opcional)
            </label>
            <textarea
              id="ai-rewrite-instruction"
              className="ai-rewrite-instruction"
              placeholder="Ej: 'más conciso', 'incluí el tipo de transductor si está mencionado', 'enfatizá diagnóstico diferencial'"
              value={instruction}
              maxLength={INSTRUCTION_MAX_CHARS}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
            />
            <small className="ai-rewrite-instruction-hint">
              La IA siempre aplica las reglas editoriales (título = diagnóstico visible, descripción
              = solo hallazgos ecográficos, tags clínicos en ES + EN). Esta instrucción se appendea
              — no las sobrescribe.
              <span className="ai-rewrite-instruction-count">
                {instruction.length} / {INSTRUCTION_MAX_CHARS}
              </span>
            </small>
            <div className="ai-rewrite-actions">
              <button
                type="button"
                className="ai-rewrite-action ai-rewrite-action--review"
                onClick={onGenerateAndReview}
              >
                Generar y revisar
              </button>
              <button
                type="button"
                className="ai-rewrite-action ai-rewrite-action--direct"
                onClick={onGenerateAndSaveDirect}
              >
                Generar y guardar directo
              </button>
            </div>
          </>
        )}

        {/* Loading phase: spinner + label of which path was chosen. */}
        {phase.kind === "loading" && (
          <div className="ai-rewrite-loading" role="status" aria-live="polite">
            <span className="ai-rewrite-spinner" aria-hidden="true" />
            <span>
              {phase.pathAfterLoad === "review"
                ? "Generando — esto va a tomar ~3-8 segundos…"
                : "Generando y guardando — esto va a tomar ~3-8 segundos…"}
            </span>
          </div>
        )}

        {/* Confirmation step before the direct-save path actually
            fires. Mirrors the user's "con confirmación tipo
            ¿estás seguro?" request. */}
        {phase.kind === "confirming-save-direct" && (
          <div className="ai-rewrite-confirm">
            <p>
              ¿Generar y <strong>guardar directo</strong> sin paso de revisión?
            </p>
            <p className="ai-rewrite-confirm-detail">
              La IA va a sobrescribir título, descripción y tags en ES + EN. Podés deshacerlo
              después abriendo el caso manualmente.
            </p>
            <div className="ai-rewrite-actions">
              <button
                type="button"
                className="ai-rewrite-action ai-rewrite-action--direct"
                onClick={onConfirmSaveDirect}
              >
                Sí, generar y guardar
              </button>
              <button
                type="button"
                className="ai-rewrite-action ai-rewrite-action--cancel"
                onClick={() => setPhase({ kind: "configure" })}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Review phase: editable fields with the AI's suggestion.
            Admin tweaks anything they don't like, clicks Aplicar. */}
        {phase.kind === "review" && (
          <>
            <div className="ai-rewrite-meta">
              <span>
                <strong>Modelo:</strong> {phase.result.meta.model}
              </span>
              <span>
                <strong>Latencia:</strong> {phase.result.meta.durationMs} ms
              </span>
              {phase.result.meta.promptTokens !== null && (
                <span>
                  <strong>Tokens:</strong> {phase.result.meta.promptTokens}↑/{" "}
                  {phase.result.meta.completionTokens ?? 0}↓
                </span>
              )}
            </div>
            <div className="ai-rewrite-review">
              <fieldset className="ai-rewrite-lang">
                <legend>Español (ES)</legend>
                <label htmlFor="ai-rewrite-es-title">Título</label>
                <input
                  id="ai-rewrite-es-title"
                  type="text"
                  value={editEsTitle}
                  onChange={(e) => setEditEsTitle(e.target.value)}
                />
                <label htmlFor="ai-rewrite-es-desc">Descripción</label>
                <textarea
                  id="ai-rewrite-es-desc"
                  value={editEsDescription}
                  onChange={(e) => setEditEsDescription(e.target.value)}
                  rows={4}
                />
                <label htmlFor="ai-rewrite-es-tags">Tags (separados por coma)</label>
                <input
                  id="ai-rewrite-es-tags"
                  type="text"
                  value={editEsTags}
                  onChange={(e) => setEditEsTags(e.target.value)}
                />
              </fieldset>
              <fieldset className="ai-rewrite-lang">
                <legend>English (EN)</legend>
                <label htmlFor="ai-rewrite-en-title">Title</label>
                <input
                  id="ai-rewrite-en-title"
                  type="text"
                  value={editEnTitle}
                  onChange={(e) => setEditEnTitle(e.target.value)}
                />
                <label htmlFor="ai-rewrite-en-desc">Description</label>
                <textarea
                  id="ai-rewrite-en-desc"
                  value={editEnDescription}
                  onChange={(e) => setEditEnDescription(e.target.value)}
                  rows={4}
                />
                <label htmlFor="ai-rewrite-en-tags">Tags (comma-separated)</label>
                <input
                  id="ai-rewrite-en-tags"
                  type="text"
                  value={editEnTags}
                  onChange={(e) => setEditEnTags(e.target.value)}
                />
              </fieldset>
            </div>
            <div className="ai-rewrite-actions">
              <button
                type="button"
                className="ai-rewrite-action ai-rewrite-action--review"
                onClick={onApplyFromReview}
              >
                Aplicar y guardar
              </button>
              <button
                type="button"
                className="ai-rewrite-action ai-rewrite-action--cancel"
                onClick={() => setPhase({ kind: "configure" })}
              >
                Descartar y volver a generar
              </button>
            </div>
          </>
        )}

        {phase.kind === "error" && (
          <div className="ai-rewrite-error" role="alert">
            <strong>Error de la IA:</strong> {phase.message}
            <div className="ai-rewrite-actions">
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
      </div>
    </dialog>
  );
}
