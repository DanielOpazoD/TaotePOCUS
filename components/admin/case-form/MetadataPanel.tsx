"use client";

// Metadatos: title, category, modality, author, role, date,
// description, tags. The most-frequently-edited surface — admins
// land here when opening the form, this panel is the default tab.
//
// All fields are controlled — value comes from the parent's
// `form` state, changes go through `update` (a partial-patch
// callback the parent merges into form state).

import { useMemo, useState } from "react";
import { COMMON_TAGS } from "@/lib/data";
import { getDescription } from "@/lib/case-description";
import type { CaseRecord, Category } from "@/lib/types";
import type { FormUpdate } from "./types";

interface Props {
  form: CaseRecord;
  categories: Category[];
  /** Catalog-wide tag vocabulary for the autocomplete. The form
   *  unions this with `COMMON_TAGS` and dedupes by case-insensitive
   *  comparison. Optional — falls back to `COMMON_TAGS` only. */
  tagSuggestions?: string[];
  update: FormUpdate;
}

export function MetadataPanel({ form, categories, tagSuggestions, update }: Props) {
  const [tagInput, setTagInput] = useState("");

  // Autocomplete vocabulary: union of `COMMON_TAGS` (the curated
  // editorial list) + every tag in use across the catalog (passed
  // in by the admin context), minus tags already attached to the
  // case being edited. Sorted alphabetically — datalist renders
  // them in the order we hand them over and most browsers also
  // apply a prefix filter on top, so order is the only knob we
  // have on what surfaces first. Memoized so the dropdown doesn't
  // re-allocate on every keystroke.
  const tagOptions = useMemo<string[]>(() => {
    const inUse = new Set(form.tags);
    const universe = new Set<string>([...COMMON_TAGS, ...(tagSuggestions ?? [])]);
    inUse.forEach((t) => universe.delete(t));
    return Array.from(universe)
      .filter((t) => t.length > 0)
      .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [form.tags, tagSuggestions]);

  // Description goes through `getDescription` so legacy cases (with
  // `findings` / `summary` / `diagnosis` instead of `description`)
  // surface their text into the textarea on first edit. Writes always
  // land on the canonical `description` field — the admin's edit
  // permanently moves the case onto the new shape.
  const description = getDescription(form);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!form.tags.includes(t)) update({ tags: [...form.tags, t] });
    setTagInput("");
  };

  const removeTag = (t: string) => update({ tags: form.tags.filter((x) => x !== t) });

  return (
    <div className="admin-form-fields">
      <label className="admin-label" htmlFor="case-form-title">
        Título
      </label>
      <input
        id="case-form-title"
        className="admin-input"
        value={form.title}
        onChange={(e) => update({ title: e.target.value })}
        placeholder="Ej: Derrame pleural masivo"
        required
      />

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

      {/* Single description field. Replaced the trio of
          Resumen / Hallazgos / Diagnóstico that used to live
          here (Apr-2026 simplification + May-2026 backfill,
          ADR-0010). Reads via `getDescription` (legacy fallback
          chain) and writes the canonical `description` field
          directly. */}
      <label className="admin-label" htmlFor="case-form-description">
        Descripción
      </label>
      <textarea
        id="case-form-description"
        className="admin-input"
        rows={6}
        value={description}
        onChange={(e) => update({ description: e.target.value })}
        placeholder="Describe el caso: contexto clínico, lo que se ve en la imagen, conclusión…"
        required
      />

      <label className="admin-label" htmlFor="case-form-tag-input">
        Etiquetas
      </label>
      <div className="admin-tags-input">
        {form.tags.map((t) => (
          <span key={t} className="tag-chip active">
            {t}{" "}
            <button type="button" onClick={() => removeTag(t)} aria-label={`Quitar etiqueta ${t}`}>
              ×
            </button>
          </span>
        ))}
        <input
          id="case-form-tag-input"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          // Native datalist autocomplete (see `<datalist>`
          // below). Browser handles the prefix filter and the
          // dropdown rendering; we just supply the vocabulary.
          list="case-form-tag-suggestions"
          autoComplete="off"
          placeholder="Agregar etiqueta + Enter"
          className="admin-tag-input"
        />
        {/* Vocabulary for the input above. Suggestions exclude
            tags already attached to this case, so the dropdown
            surfaces meaningful candidates. */}
        <datalist id="case-form-tag-suggestions">
          {tagOptions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
