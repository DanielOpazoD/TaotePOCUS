"use client";

// Metadatos: title, category, modality, author, role, date,
// description, tags. The most-frequently-edited surface — admins
// land here when opening the form, this panel is the default tab.
//
// All fields are controlled — value comes from the parent's
// `form` state, changes go through `update` (a partial-patch
// callback the parent merges into form state).
//
// Phase-2 i18n (Nov-2026): title / description / tags became
// `LocalizedString` / `LocalizedTags`. The panel now renders two
// columns side by side — Spanish (mandatory baseline) on the left
// and English (optional translation) on the right — so the admin
// can read one language while typing the other. Tags are two
// independent chip lists; only the ES list autocompletes against
// the catalog vocabulary because it is the editorial source.

import { useMemo, useState } from "react";
import { COMMON_TAGS } from "@/lib/data";
import type { CaseRecord, Category, LocalizedString, LocalizedTags } from "@/lib/types";
import type { FormUpdate } from "./types";

interface Props {
  form: CaseRecord;
  categories: Category[];
  /** Catalog-wide tag vocabulary for the autocomplete (Spanish
   *  source list). The form unions this with `COMMON_TAGS` and
   *  dedupes by case-insensitive comparison. Optional — falls back
   *  to `COMMON_TAGS` only. EN suggestions are not surfaced because
   *  the EN tag corpus grows organically with translations. */
  tagSuggestions?: string[];
  update: FormUpdate;
}

/** Patch builder for a single language slot on a `LocalizedString`.
 *  Preserves the other slot so editing ES doesn't clear EN. */
function patchLocalizedString(
  prev: LocalizedString,
  slot: "es" | "en",
  value: string,
): LocalizedString {
  const next: LocalizedString = { es: prev.es };
  if (slot === "es") {
    next.es = value;
    if (prev.en && prev.en.length > 0) next.en = prev.en;
  } else {
    if (value.length > 0) next.en = value;
    // omitting `en` when the input is empty — the schema treats
    // missing EN as "translation pending" (fallback to ES at read).
  }
  return next;
}

/** Patch builder for a tag list slot. Same preservation semantics. */
function patchLocalizedTags(
  prev: LocalizedTags,
  slot: "es" | "en",
  value: string[],
): LocalizedTags {
  if (slot === "es") {
    const next: LocalizedTags = { es: value };
    if (prev.en && prev.en.length > 0) next.en = prev.en;
    return next;
  }
  const next: LocalizedTags = { es: prev.es };
  if (value.length > 0) next.en = value;
  return next;
}

export function MetadataPanel({ form, categories, tagSuggestions, update }: Props) {
  const [tagInputEs, setTagInputEs] = useState("");
  const [tagInputEn, setTagInputEn] = useState("");

  // ES autocomplete vocabulary: union of `COMMON_TAGS` (the curated
  // editorial list) + every Spanish tag in use across the catalog,
  // minus tags already attached to the case being edited.
  const tagOptionsEs = useMemo<string[]>(() => {
    const inUse = new Set(form.tags.es);
    const universe = new Set<string>([...COMMON_TAGS, ...(tagSuggestions ?? [])]);
    inUse.forEach((t) => universe.delete(t));
    return Array.from(universe)
      .filter((t) => t.length > 0)
      .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [form.tags.es, tagSuggestions]);

  // ─── Field-level patch helpers ─────────────────────────────────
  const setTitle = (slot: "es" | "en", value: string) =>
    update({ title: patchLocalizedString(form.title, slot, value) });
  const setDescription = (slot: "es" | "en", value: string) =>
    update({ description: patchLocalizedString(form.description, slot, value) });

  const addTag = (slot: "es" | "en") => {
    const value = (slot === "es" ? tagInputEs : tagInputEn).trim();
    if (!value) return;
    const list = slot === "es" ? form.tags.es : (form.tags.en ?? []);
    if (!list.includes(value)) {
      update({ tags: patchLocalizedTags(form.tags, slot, [...list, value]) });
    }
    if (slot === "es") setTagInputEs("");
    else setTagInputEn("");
  };
  const removeTag = (slot: "es" | "en", t: string) => {
    const list = slot === "es" ? form.tags.es : (form.tags.en ?? []);
    update({
      tags: patchLocalizedTags(
        form.tags,
        slot,
        list.filter((x) => x !== t),
      ),
    });
  };

  return (
    <div className="admin-form-fields">
      {/* Title — bilingual pair. ES is required (baseline editorial
          content); EN is optional (translation done case by case). */}
      <div className="admin-row admin-row--bilingual">
        <div>
          <label className="admin-label" htmlFor="case-form-title-es">
            Título · ES
          </label>
          <input
            id="case-form-title-es"
            className="admin-input"
            value={form.title.es}
            onChange={(e) => setTitle("es", e.target.value)}
            placeholder="Ej: Derrame pleural masivo"
            required
          />
        </div>
        <div>
          <label className="admin-label" htmlFor="case-form-title-en">
            Title · EN <span className="admin-label-hint">(opcional)</span>
          </label>
          <input
            id="case-form-title-en"
            className="admin-input"
            value={form.title.en ?? ""}
            onChange={(e) => setTitle("en", e.target.value)}
            placeholder="Ex: Massive pleural effusion"
          />
        </div>
      </div>

      <div className="admin-row">
        <div>
          <label className="admin-label">Categoría</label>
          <select
            className="admin-input"
            value={form.category}
            onChange={(e) => update({ category: e.target.value })}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="admin-label">Modalidad / sonda</label>
          <input
            className="admin-input"
            value={form.modality}
            onChange={(e) => update({ modality: e.target.value })}
            placeholder="Sonda lineal · 5 MHz"
          />
        </div>
      </div>

      <div className="admin-row">
        <div>
          <label className="admin-label">Autor</label>
          <input
            className="admin-input"
            value={form.author}
            onChange={(e) => update({ author: e.target.value })}
          />
        </div>
        <div>
          <label className="admin-label">Especialidad</label>
          <input
            className="admin-input"
            value={form.role}
            onChange={(e) => update({ role: e.target.value })}
          />
        </div>
      </div>

      <label className="admin-label">Fecha</label>
      <input
        className="admin-input"
        type="date"
        value={form.date}
        onChange={(e) => update({ date: e.target.value })}
      />

      {/* Description — bilingual pair, same layout as title. */}
      <div className="admin-row admin-row--bilingual">
        <div>
          <label className="admin-label" htmlFor="case-form-description-es">
            Descripción · ES
          </label>
          <textarea
            id="case-form-description-es"
            className="admin-input"
            rows={6}
            value={form.description.es}
            onChange={(e) => setDescription("es", e.target.value)}
            placeholder="Describe el caso: contexto clínico, lo que se ve en la imagen, conclusión…"
            required
          />
        </div>
        <div>
          <label className="admin-label" htmlFor="case-form-description-en">
            Description · EN <span className="admin-label-hint">(opcional)</span>
          </label>
          <textarea
            id="case-form-description-en"
            className="admin-input"
            rows={6}
            value={form.description.en ?? ""}
            onChange={(e) => setDescription("en", e.target.value)}
            placeholder="Describe the case: clinical context, what's visible, conclusion…"
          />
        </div>
      </div>

      {/* Tags — two independent lists. Free-form per the product
          decision; each language has its own curated chip set. ES
          autocompletes against the catalog vocabulary; EN does not
          (its corpus is the case's own EN list, which the admin
          builds case by case). */}
      <div className="admin-row admin-row--bilingual">
        <div>
          <label className="admin-label" htmlFor="case-form-tag-input-es">
            Etiquetas · ES
          </label>
          <div className="admin-tags-input">
            {form.tags.es.map((t) => (
              <span key={t} className="tag-chip active">
                {t}{" "}
                <button
                  type="button"
                  onClick={() => removeTag("es", t)}
                  aria-label={`Quitar etiqueta ${t}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              id="case-form-tag-input-es"
              value={tagInputEs}
              onChange={(e) => setTagInputEs(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag("es");
                }
              }}
              list="case-form-tag-suggestions-es"
              autoComplete="off"
              placeholder="Agregar etiqueta + Enter"
              className="admin-tag-input"
            />
            <datalist id="case-form-tag-suggestions-es">
              {tagOptionsEs.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>
        <div>
          <label className="admin-label" htmlFor="case-form-tag-input-en">
            Tags · EN <span className="admin-label-hint">(opcional)</span>
          </label>
          <div className="admin-tags-input">
            {(form.tags.en ?? []).map((t) => (
              <span key={t} className="tag-chip active">
                {t}{" "}
                <button
                  type="button"
                  onClick={() => removeTag("en", t)}
                  aria-label={`Remove tag ${t}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              id="case-form-tag-input-en"
              value={tagInputEn}
              onChange={(e) => setTagInputEn(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag("en");
                }
              }}
              autoComplete="off"
              placeholder="Add tag + Enter"
              className="admin-tag-input"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
