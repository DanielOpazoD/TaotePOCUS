// Shared types and constants for the case-form panels. Kept in a
// non-component file so each panel can import the types without
// pulling in another component's JSX.

import type { CaseRecord } from "@/lib/types";

/**
 * The four panels of the case form, surfaced as tabs:
 *
 *   - `metadata` — title, category, modality, author, role, date,
 *     description, tags. The most-frequently-edited fields. Default
 *     active tab.
 *   - `media`    — primary uploader + extra images carousel + cine-
 *     loop fallback synthesizer. Larger surface, less common edit.
 *   - `advanced` — section selector + featured flag. Structural
 *     decisions an admin sets once and rarely revisits.
 *   - `ai`       — translation suggestions (Gemini / OpenAI /
 *     DeepSeek / stub) for the EN ↔ ES slots. Optional flow; the
 *     ES baseline can be saved without ever visiting this tab.
 */
export type CaseFormTab = "metadata" | "media" | "advanced" | "ai";

// localStorage caps at ~5 MB across all keys (per origin in most
// browsers). dataURL adds ~33% over the binary size due to base64.
// We hard-cap raw uploads at 3 MB so the encoded form stays under
// ~4 MB and there's room left for other state. The admin sees a
// clear toast if rejected.
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Shared shape for the per-panel `update` callback the orchestrator
 *  passes down. Each panel applies a partial patch to the working
 *  draft; the orchestrator merges it into form state. */
export type FormUpdate = (patch: Partial<CaseRecord>) => void;
