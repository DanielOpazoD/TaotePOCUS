"use client";

// Avanzado: section selector, cine-loop synthetic fallback, featured
// flag. Structural decisions an admin sets once and rarely touches
// afterwards. Lives behind the "Avanzado" tab so the metadata +
// media surfaces stay focused on the per-case content.

import { sectionLabel, type DictKey } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import type { CaseRecord, LoopKind } from "@/lib/types";
import type { FormUpdate } from "./types";

interface Props {
  form: CaseRecord;
  update: FormUpdate;
}

/** Loop-scene options the form exposes. The id list is the subset
 *  of `LoopKind` that pairs with a clinical case (the `info-*` /
 *  `ecg-*` scenes are synthetic backdrops for the public hero, not
 *  user-pickable on the form). Each scene id has a matching dict
 *  key under `form.advanced.loop.<id>` — adding a future scene
 *  needs both a `LoopKind` extension AND a dict entry, and the
 *  dict resolver below catches a missing entry at runtime. */
const LOOP_OPTIONS: ReadonlyArray<LoopKind> = [
  "blines",
  "tamponade",
  "morrison",
  "seashore",
  "ijv",
  "dvt",
  "hydro",
  "ob",
  "lvfunction",
  "aaa",
  "consolidation",
  "gallstone",
];

/** Section dropdown options, in the same order as the public nav. */
const SECTION_OPTIONS: ReadonlyArray<CaseRecord["section"]> = [
  "atlas",
  "ecg",
  "cases",
  "info",
  "rayos",
];

export function AdvancedPanel({ form, update }: Props) {
  const { lang, t } = useLanguage();
  return (
    <div className="admin-form-fields">
      <label className="admin-label" htmlFor="case-form-section">
        {t("form.advanced.section.label")}
      </label>
      <select
        id="case-form-section"
        value={form.section}
        onChange={(e) => update({ section: e.target.value as CaseRecord["section"] })}
        className="admin-input"
      >
        {SECTION_OPTIONS.map((id) => (
          <option key={id} value={id}>
            {sectionLabel(id, lang)}
          </option>
        ))}
      </select>

      {/* Cine-loop fallback dropdown is only relevant when there's
          NO real media — it picks the synthetic scene drawn on
          canvas as a placeholder. Once a real video/image is
          attached, the field is irrelevant and just clutter. */}
      {!form.media ? (
        <>
          <label className="admin-label" htmlFor="case-form-loop">
            {t("form.advanced.loop.label")}
          </label>
          <select
            id="case-form-loop"
            value={form.loop}
            onChange={(e) => update({ loop: e.target.value as LoopKind })}
            className="admin-input"
          >
            {LOOP_OPTIONS.map((id) => (
              <option key={id} value={id}>
                {t(`form.advanced.loop.${id}` as DictKey)}
              </option>
            ))}
          </select>
          <small className="admin-hint">{t("form.advanced.loop.hint")}</small>
        </>
      ) : (
        <small className="admin-hint" style={{ marginTop: 8 }}>
          {t("form.advanced.loop.notUsed")}
        </small>
      )}

      <label className="admin-checkbox" style={{ marginTop: 16 }}>
        <input
          type="checkbox"
          checked={!!form.featured}
          onChange={(e) => update({ featured: e.target.checked })}
        />
        <span>{t("form.advanced.featured.label")}</span>
      </label>
      <small className="admin-hint">{t("form.advanced.featured.hint")}</small>
    </div>
  );
}
