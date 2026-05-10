"use client";

// Admin "Foco" tab — manage thumbnail focus defaults at three scopes:
//
//   1. Global default — applies when no narrower scope matches.
//   2. Per-section default — overrides the global for one section.
//   3. Per-category default — overrides both for one category.
//
// At render time, `lib/focus.ts → resolveFocus()` walks narrowest →
// broadest. A per-case override (set from `<AdminThumbMenu>`) always
// wins; this panel handles the layers BELOW that.
//
// UI shape:
//   - Three collapsible sections (global / sections / categories).
//   - Each row uses the shared `<FocusEditor>` so the editing
//     vocabulary is identical to the per-case editor.
//   - "Use default" / "Reset slot" affordances clear a slot so the
//     resolver falls through to the next layer.
//   - "Reset all" wipes every slot back to fresh-install state.

import { useState } from "react";
import { useT } from "@/hooks/useLanguage";
import { SECTIONS } from "@/lib/data";
import { categoryLabelEs, sectionLabel } from "@/lib/i18n";
import FocusEditor from "./FocusEditor";
import { isDefaultFocus } from "@/lib/focus";
import type { Category, FocusDefaults, FocusValue, SectionId } from "@/lib/types";

interface Props {
  defaults: FocusDefaults;
  categories: Category[];
  onSetGlobal: (value: FocusValue | undefined) => void;
  onSetSection: (id: SectionId, value: FocusValue | undefined) => void;
  onSetCategory: (id: string, value: FocusValue | undefined) => void;
  /** Optional — when provided, surface a "Reset todo" button at the
   *  top of the panel that wipes every slot back to fresh-install
   *  state. Defensive: shows a window.confirm prompt because this
   *  affects every section + category at once. */
  onResetAll?: () => void;
}

type ExpandKey = string;

/** Friendly summary of a `FocusValue` — shown next to closed rows so
 *  the admin sees what's saved without having to expand the editor.
 *  Returns `null` for "default / unset", letting callers render their
 *  preferred placeholder. */
function describeFocus(focus: FocusValue | undefined, defaultLabel: string): string {
  if (!focus || isDefaultFocus(focus)) return defaultLabel;
  const x = focus.x ?? 50;
  const y = focus.y ?? 50;
  const scale = focus.scale ?? 1;
  const parts: string[] = [];
  if (x !== 50 || y !== 50) parts.push(`x ${Math.round(x)}% · y ${Math.round(y)}%`);
  if (scale !== 1) parts.push(`zoom ${Math.round(scale * 100)}%`);
  return parts.join(" · ");
}

export default function FocusDefaultsPanel({
  defaults,
  categories,
  onSetGlobal,
  onSetSection,
  onSetCategory,
  onResetAll,
}: Props) {
  const t = useT();
  const [expanded, setExpanded] = useState<Set<ExpandKey>>(() => new Set(["global"]));

  const toggle = (key: ExpandKey) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleResetAll = () => {
    if (!onResetAll) return;
    if (window.confirm(t("focus.defaults.confirmResetAll"))) {
      onResetAll();
      // Collapse all rows so the user sees a clean panel after the
      // wipe. The "global" expansion is preserved as a hint that
      // they can start fresh from there.
      setExpanded(new Set(["global"]));
    }
  };

  const defaultLabel = t("focus.defaults.usingDefault");

  return (
    <div className="focus-defaults-panel">
      <div className="categories-intro">
        <h2>{t("focus.defaults.title")}</h2>
        <p>{t("focus.defaults.intro")}</p>
      </div>

      {onResetAll && (
        <div className="focus-defaults-toolbar">
          <button type="button" className="btn-ghost" onClick={handleResetAll}>
            {t("focus.defaults.resetAll")}
          </button>
        </div>
      )}

      {/* ─── Global ─────────────────────────────────────────────── */}
      <section className="focus-defaults-section">
        <header
          className="focus-defaults-row-head"
          onClick={() => toggle("global")}
          role="button"
          aria-expanded={expanded.has("global")}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle("global");
            }
          }}
        >
          <span className="focus-defaults-row-title">{t("focus.defaults.global.label")}</span>
          <span className="focus-defaults-row-summary">
            {describeFocus(defaults.global, defaultLabel)}
          </span>
          <span className="focus-defaults-row-chevron" aria-hidden="true">
            {expanded.has("global") ? "−" : "+"}
          </span>
        </header>
        {expanded.has("global") && (
          <div className="focus-defaults-row-body">
            <FocusEditor
              value={defaults.global}
              onSave={(next) => onSetGlobal(next)}
              onReset={() => onSetGlobal(undefined)}
            />
          </div>
        )}
      </section>

      {/* ─── Per-section ───────────────────────────────────────── */}
      <div className="admin-section-head">
        <h3>{t("focus.defaults.sections.label")}</h3>
        <span className="admin-trash-count">
          {Object.keys(defaults.sections ?? {}).length}/{SECTIONS.length}
        </span>
      </div>
      <ul className="focus-defaults-list">
        {SECTIONS.map((s) => {
          const key = `s:${s.id}`;
          const slot = defaults.sections?.[s.id];
          const isOn = expanded.has(key);
          return (
            <li key={s.id} className="focus-defaults-row">
              <header
                className="focus-defaults-row-head"
                onClick={() => toggle(key)}
                role="button"
                aria-expanded={isOn}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(key);
                  }
                }}
              >
                <span className="focus-defaults-row-title">{sectionLabel(s.id, "es")}</span>
                <span className="focus-defaults-row-summary">
                  {describeFocus(slot, defaultLabel)}
                </span>
                <span className="focus-defaults-row-chevron" aria-hidden="true">
                  {isOn ? "−" : "+"}
                </span>
              </header>
              {isOn && (
                <div className="focus-defaults-row-body">
                  <FocusEditor
                    value={slot}
                    onSave={(next) => onSetSection(s.id, next)}
                    onReset={() => onSetSection(s.id, undefined)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* ─── Per-category ──────────────────────────────────────── */}
      <div className="admin-section-head">
        <h3>{t("focus.defaults.categories.label")}</h3>
        <span className="admin-trash-count">
          {Object.keys(defaults.categories ?? {}).length}/{categories.length}
        </span>
      </div>
      <ul className="focus-defaults-list">
        {categories.map((c) => {
          const key = `c:${c.id}`;
          const slot = defaults.categories?.[c.id];
          const isOn = expanded.has(key);
          return (
            <li key={c.id} className="focus-defaults-row">
              <header
                className="focus-defaults-row-head"
                onClick={() => toggle(key)}
                role="button"
                aria-expanded={isOn}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(key);
                  }
                }}
              >
                <span className="focus-defaults-row-title">{categoryLabelEs(c)}</span>
                <span className="focus-defaults-row-summary">
                  {describeFocus(slot, defaultLabel)}
                </span>
                <span className="focus-defaults-row-chevron" aria-hidden="true">
                  {isOn ? "−" : "+"}
                </span>
              </header>
              {isOn && (
                <div className="focus-defaults-row-body">
                  <FocusEditor
                    value={slot}
                    onSave={(next) => onSetCategory(c.id, next)}
                    onReset={() => onSetCategory(c.id, undefined)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
