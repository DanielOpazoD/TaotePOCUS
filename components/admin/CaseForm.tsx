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
import { getDescription } from "@/lib/case-description";
import type { CaseRecord, Category, User } from "@/lib/types";
import { MetadataPanel } from "./case-form/MetadataPanel";
import { MediaPanel } from "./case-form/MediaPanel";
import { AdvancedPanel } from "./case-form/AdvancedPanel";
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

const TABS: TabDescriptor[] = [
  { id: "metadata", label: "Metadatos" },
  { id: "media", label: "Media" },
  { id: "advanced", label: "Avanzado" },
];

export default function CaseForm({
  initial,
  currentUser,
  categories = CATEGORIES,
  tagSuggestions,
  onSave,
  onCancel,
}: Props) {
  const blank: CaseRecord = {
    id: "",
    section: "atlas",
    title: "",
    category: "cardiac",
    tags: [],
    modality: "",
    loop: "blines",
    media: undefined,
    author: currentUser?.name || "Administrador",
    role: "Administrador",
    date: new Date().toISOString().slice(0, 10),
    description: "",
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

  const update = (patch: Partial<CaseRecord>) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Description goes through `getDescription` so legacy cases
    // (with `findings` / `summary` / `diagnosis` instead of
    // `description`) still pass the validation gate without the
    // admin re-typing their body. New writes always populate the
    // canonical `description` field.
    const description = getDescription(form);
    if (!form.title.trim() || !description.trim()) {
      // If validation fails because of a field that lives in a
      // non-active tab, switch to the tab that hosts the missing
      // field so the admin can see what's wrong. Both gated fields
      // (title + description) live on the Metadatos panel.
      setTab("metadata");
      return;
    }
    const id = form.id || `u_${Date.now().toString(36)}`;
    onSave({ ...form, id });
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal admin-form-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative" }}
      >
        <button className="modal-close" onClick={onCancel} type="button">
          {Icon.close()}
        </button>
        <form onSubmit={submit}>
          <div className="admin-form-head">
            <div className="case-cat">{initial ? "Editar caso" : "Nuevo caso"}</div>
            <h2>Sube contenido al atlas</h2>
            <p>
              Imagen estática, GIF, video clip o cine-loop sintético si todavía no tienes archivo.
            </p>
          </div>

          <div className="admin-form-tabs" role="tablist" aria-label="Secciones del formulario">
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
          </div>

          <div className="admin-form-actions">
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              {initial ? "Guardar cambios" : "Publicar caso"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
