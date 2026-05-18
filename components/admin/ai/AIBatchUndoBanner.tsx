"use client";

// "Deshacer último batch" banner. Renders only when there's a
// recent AI batch in the undo buffer (see `lib/ai-batch-undo.ts`).
// One click → applies the BEFORE-state patch of every case in the
// batch + clears the buffer. The patches go through the same
// `onApplyPatch` that the AI used to write them, so the same
// override + audit pipeline handles them.
//
// **Polling**: the banner reads localStorage on mount + every 30s
// to catch:
//   - A new batch landing from a different tab.
//   - The TTL expiring while the admin is on the page.
//
// 30s is a tight enough interval to feel responsive without
// hammering localStorage. The read is a single `getItem` + JSON
// parse — microsecond-cost.

import { useCallback, useEffect, useState } from "react";
import { clearLastAIBatch, getLastAIBatch, type AIBatch } from "@/lib/ai-batch-undo";
import type { CaseRecord } from "@/lib/types";

const POLL_INTERVAL_MS = 30_000;

interface Props {
  /** Same patch handler the AI flows use to write changes. The undo
   *  restores the BEFORE state via this seam — so the override map,
   *  the undo toast, and the audit trail all behave identically. */
  onApplyPatch: (id: string, patch: Partial<CaseRecord>) => Promise<void> | void;
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "hace menos de 1 min";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours} h`;
}

export function AIBatchUndoBanner({ onApplyPatch }: Props) {
  const [batch, setBatch] = useState<AIBatch | null>(() => getLastAIBatch());
  const [reverting, setReverting] = useState(false);

  // Re-read the buffer periodically. Catches:
  //   - Another tab finishing a batch.
  //   - The TTL silently expiring.
  // Cheap (single localStorage read), and we stop polling when the
  // banner is unmounted via the cleanup return.
  useEffect(() => {
    const interval = setInterval(() => {
      setBatch(getLastAIBatch());
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Listen for the `storage` event so cross-tab batch landings are
  // picked up immediately (without waiting for the polling tick).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === "taote.ai.lastBatch" || e.key === null) {
        setBatch(getLastAIBatch());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const onUndo = useCallback(async () => {
    if (!batch) return;
    setReverting(true);
    // Apply each before-state patch sequentially. The undo doesn't
    // need parallelism — it's typically small (1-50 entries) and
    // the existing onPatch enqueues them to the override map
    // cleanly.
    for (const entry of batch.entries) {
      // Build a patch from the `before` snapshot. Only fields that
      // were captured (i.e., touched by the AI) are reverted; the
      // rest stay as they are now.
      const patch: Partial<CaseRecord> = {};
      if (entry.before.title) patch.title = entry.before.title;
      if (entry.before.description) patch.description = entry.before.description;
      if (entry.before.tags) patch.tags = entry.before.tags;
      // For translationMeta: if the case had no meta before, we
      // restore it to undefined; if it had one, we restore that one.
      // `undefined` in a patch typically means "don't touch" — but
      // the goal here is to UNDO the AI marker, so we explicitly
      // set it to the prior value (which may itself be undefined,
      // signaling "no AI provenance").
      patch.translationMeta = entry.before.translationMeta;
      await onApplyPatch(entry.caseId, patch);
    }
    clearLastAIBatch();
    setBatch(null);
    setReverting(false);
  }, [batch, onApplyPatch]);

  const onDismiss = useCallback(() => {
    clearLastAIBatch();
    setBatch(null);
  }, []);

  if (!batch) return null;

  const operationLabel = batch.operation === "rewrite" ? "reescribir" : "traducción";

  return (
    <div className="ai-batch-undo" role="status" aria-live="polite">
      <span className="ai-batch-undo-icon" aria-hidden="true">
        ↶
      </span>
      <span className="ai-batch-undo-text">
        Último <strong>{operationLabel} con IA</strong> sobre{" "}
        <strong>
          {batch.entries.length} caso{batch.entries.length === 1 ? "" : "s"}
        </strong>{" "}
        ({formatRelativeTime(batch.appliedAt)}).
      </span>
      <button
        type="button"
        className="ai-batch-undo-action"
        onClick={onUndo}
        disabled={reverting}
        aria-label={`Deshacer último batch de IA (${batch.entries.length} casos)`}
      >
        {reverting ? "Revirtiendo…" : "Deshacer"}
      </button>
      <button
        type="button"
        className="ai-batch-undo-dismiss"
        onClick={onDismiss}
        aria-label="Descartar la oferta de deshacer"
        title="No me ofrezcas más este deshacer"
      >
        ×
      </button>
    </div>
  );
}
