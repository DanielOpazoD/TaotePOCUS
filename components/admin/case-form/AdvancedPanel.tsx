"use client";

// Avanzado: section selector, cine-loop synthetic fallback, featured
// flag. Structural decisions an admin sets once and rarely touches
// afterwards. Lives behind the "Avanzado" tab so the metadata +
// media surfaces stay focused on the per-case content.

import type { CaseRecord, LoopKind } from "@/lib/types";
import type { FormUpdate } from "./types";

interface Props {
  form: CaseRecord;
  update: FormUpdate;
}

export function AdvancedPanel({ form, update }: Props) {
  return (
    <div className="admin-form-fields">
      <label className="admin-label" htmlFor="case-form-section">
        Sección
      </label>
      <select
        id="case-form-section"
        value={form.section}
        onChange={(e) => update({ section: e.target.value as CaseRecord["section"] })}
        className="admin-input"
      >
        <option value="atlas">Atlas POCUS</option>
        <option value="ecg">ECG</option>
        <option value="cases">Casos clínicos</option>
        <option value="info">Infografías</option>
        <option value="rayos">Rayos</option>
      </select>

      {/* Cine-loop fallback dropdown is only relevant when there's
          NO real media — it picks the synthetic scene drawn on
          canvas as a placeholder. Once a real video/image is
          attached, the field is irrelevant and just clutter. */}
      {!form.media ? (
        <>
          <label className="admin-label" htmlFor="case-form-loop">
            Cine-loop sintético (fallback)
          </label>
          <select
            id="case-form-loop"
            value={form.loop}
            onChange={(e) => update({ loop: e.target.value as LoopKind })}
            className="admin-input"
          >
            <option value="blines">B-líneas</option>
            <option value="tamponade">Tamponade</option>
            <option value="morrison">FAST / Morrison</option>
            <option value="seashore">Seashore (modo M)</option>
            <option value="ijv">Yugular interna</option>
            <option value="dvt">TVP</option>
            <option value="hydro">Hidronefrosis</option>
            <option value="ob">Saco gestacional</option>
            <option value="lvfunction">Función VI</option>
            <option value="aaa">AAA</option>
            <option value="consolidation">Consolidación</option>
            <option value="gallstone">Colelitiasis</option>
          </select>
          <small className="admin-hint">
            Solo se usa si no hay media real. La animación en canvas se reemplaza automáticamente
            cuando subes un archivo.
          </small>
        </>
      ) : (
        <small className="admin-hint" style={{ marginTop: 8 }}>
          Este caso ya tiene media real adjunta — el cine-loop sintético no se usa.
        </small>
      )}

      <label className="admin-checkbox" style={{ marginTop: 16 }}>
        <input
          type="checkbox"
          checked={!!form.featured}
          onChange={(e) => update({ featured: e.target.checked })}
        />
        <span>Marcar como destacado</span>
      </label>
      <small className="admin-hint">
        Los casos destacados aparecen en el carrusel "Destacados" en cada sección.
      </small>
    </div>
  );
}
