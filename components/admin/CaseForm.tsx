"use client";

// Admin form for creating / editing a case. Decomposed in May-2026
// (Bloque post-O cleanup) into three tabbed panels:
//
//   - Metadatos (default tab) — title, category, modality, author,
//     role, date, description, tags. Everything in
//     `./case-form/MetadataPanel.tsx`.
//   - Media — primary uploader, extra-images strip, errors.
//     `./case-form/MediaPanel.tsx`.
//   - Avanzado — section selector, cine-loop fallback, featured
//     flag. `./case-form/AdvancedPanel.tsx`.
//
// The orchestrator owns:
//   - Modal chrome (backdrop, close, header).
//   - Tab strip + active tab state.
//   - Working `form` state (CaseRecord under edit).
//   - The submit gate (title + description required) and id
//     generation for new cases.
//   - The upload-pipeline state shared between the metadata panel
//     (none) and media panel (primary + extras).
//
// Tests opening this form mostly query labels in the Metadatos
// panel — that's the default active tab. The form state lives in
// the orchestrator, so tab switches don't drop in-progress edits.

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { useT } from "@/hooks/useLanguage";
import type { CaseRecord, Category, User } from "@/lib/types";
import { MetadataPanel } from "./case-form/MetadataPanel";
import { MediaPanel } from "./case-form/MediaPanel";
import { AdvancedPanel } from "./case-form/AdvancedPanel";
import { AISuggestionsPanel } from "./ai/AISuggestionsPanel";
import type { CaseFormTab } from "./case-form/types";

interface Props {
  initial: CaseRecord | null;
  currentUser: User | null;
  /** Categories list (built-in + custom). Defaults to the static
   *  `CATEGORIES` so the form keeps working when rendered standalone
   *  (tests, future flows) without the admin context. */
  categories?: Category[];
  /** Vocabulary for the tag autocomplete: every tag currently in
   *  use across the catalog (deduped). The form unions this with
   *  `COMMON_TAGS` and exposes the full set via a native
   *  `<datalist>` so the admin sees existing tags as suggestions —
   *  prevents typo divergence ("B-líneas" vs "B lineas" vs
   *  "Blineas"). Optional; falls back to `COMMON_TAGS` when the
   *  admin context can't supply the in-use list. */
  tagSuggestions?: string[];
  onSave: (c: CaseRecord) => void;
  onCancel: () => void;
}

interface TabDescriptor {
  id: CaseFormTab;
  label: string;
}

export default function CaseForm({
  initial,
  currentUser,
  categories = CATEGORIES,
  tagSuggestions,
  onSave,
  onCancel,
}: Props) {
  const t = useT();
  const TABS: TabDescriptor[] = [
    { id: "metadata", label: t("form.tab.metadata") },
    { id: "media", label: t("form.tab.media") },
    { id: "advanced", label: t("form.tab.advanced") },
    { id: "ai", label: t("form.tab.ai") },
  ];
  // New cases start with empty bilingual slots — the admin types the
  // ES content first (mandatory baseline) and optionally fills the
  // EN slot before saving. Empty `en` is fine; the renderer falls
  // back to ES with a small "ES" badge when EN is missing.
  const blank: CaseRecord = {
    id: "",
    section: "atlas",
    title: { es: "" },
    category: "cardiac",
    tags: { es: [] },
    modality: "",
    loop: "blines",
    media: undefined,
    author: currentUser?.name || "Administrador",
    role: "Administrador",
    date: new Date().toISOString().slice(0, 10),
    description: { es: "" },
    featured: false,
  };
  const [form, setForm] = useState<CaseRecord>(initial || blank);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tab, setTab] = useState<CaseFormTab>("metadata");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Escape closes the modal — keyboard equivalent for the backdrop
  // click. Without this the only keyboard escape was Tab + Enter on
  // the Cancelar button, which fails WCAG SC 2.1.1 "Keyboard"
  // (every operation reachable by mouse must have a keyboard path).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const update = (patch: Partial<CaseRecord>) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validation gate: the Spanish baseline must be populated. The
    // English slot is optional — we never block save on a missing
    // translation (the renderer falls back to ES with a badge).
    if (!form.title.es.trim() || !form.description.es.trim()) {
      // If validation fails because of a field that lives in a
      // non-active tab, switch to the tab that hosts the missing
      // field so the admin can see what's wrong. Both gated fields
      // (title.es + description.es) live on the Metadatos panel.
      setTab("metadata");
      return;
    }
    const id = form.id || `u_${Date.now().toString(36)}`;
    onSave({ ...form, id });
  };

  return (
    // Backdrop click closes — keyboard equivalent is the Escape
    // listener wired above. The wrapper is a custom backdrop, not a
    // native `<dialog>`, so the a11y plumbing lives in this file.
    <div
      className="modal-backdrop"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Editor de caso"
    >
      {/* Inner panel's onClick is purely defensive (stop propagation
          to the backdrop). It's not a real interaction, so it carries
          `role="presentation"` to tell ARIA it's structural chrome. */}
      <div
        className="modal admin-form-modal"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
        style={{ position: "relative" }}
      >
        <button className="modal-close" onClick={onCancel} type="button">
          {Icon.close()}
        </button>
        <form onSubmit={submit}>
          <div className="admin-form-head">
            <div className="case-cat">{initial ? t("form.head.edit") : t("form.head.new")}</div>
            <h2>{t("form.head.title")}</h2>
            <p>{t("form.head.body")}</p>
          </div>

          <div className="admin-form-tabs" role="tablist" aria-label={t("form.tabs.aria")}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`case-form-panel-${t.id}`}
                className={`admin-form-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`case-form-panel-${tab}`}
            aria-labelledby={`case-form-tab-${tab}`}
            className="admin-form-panel"
          >
            {tab === "metadata" && (
              <MetadataPanel
                form={form}
                categories={categories}
                tagSuggestions={tagSuggestions}
                update={update}
              />
            )}
            {tab === "media" && (
              <MediaPanel
                form={form}
                update={update}
                uploading={uploading}
                setUploading={setUploading}
                uploadError={uploadError}
                setUploadError={setUploadError}
              />
            )}
            {tab === "advanced" && <AdvancedPanel form={form} update={update} />}
            {tab === "ai" && <AISuggestionsPanel form={form} update={update} />}
          </div>

          <div className="admin-form-actions">
            <button type="button" className="btn-ghost" onClick={onCancel}>
              {t("form.action.cancel")}
            </button>
            <button type="submit" className="btn-primary">
              {initial ? t("form.action.save") : t("form.action.publish")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
