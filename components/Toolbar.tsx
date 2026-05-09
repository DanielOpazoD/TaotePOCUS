"use client";

import { useEffect, useRef, useState } from "react";
import SavedViewsMenu from "./chrome/SavedViewsMenu";
import type { SortOrder, ViewState } from "@/lib/url";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  /** Number of results currently visible — drives the "N casos" copy. */
  count: number;
  /** Active tag filters; rendered as removable pills. */
  tags: string[];
  /** Active text query, used to enable/disable the clear-filters button. */
  query: string;
  /** Active sort order; the controlled value of the sort select. */
  sort: SortOrder;
  /** Patch the URL with new filter values (replace, not push). */
  onReplace: (patch: Partial<{ tags: string[]; query: string; sort: SortOrder }>) => void;
  /** Full ViewState — needed by the saved-views menu so "Save current"
   *  can capture every filter (path / cat / tags / query / sort / page)
   *  rather than just the toolbar's local slice. Optional so older
   *  callers / tests still mount a basic toolbar. */
  viewState?: ViewState;
  /** Toast surface for "Vista guardada" / "Vista eliminada"
   *  feedback. Wired in App.tsx to `showToast`. */
  notify?: (msg: string) => void;
}

/**
 * Filter chrome below the section hero: live result count, active-tag
 * pills (click to remove), "Limpiar filtros" with a tasteful shake
 * when there's nothing to clear, and the sort selector.
 *
 * Owns one transient piece of UI state — `clearShaking`, the wink
 * animation flag — and otherwise drives everything off props. Each
 * change reaches the URL via `onReplace`, which the parent maps to
 * `replacePatch`.
 */
export default function Toolbar({ count, tags, query, sort, onReplace, viewState, notify }: Props) {
  const { t } = useLanguage();
  const [clearShaking, setClearShaking] = useState(false);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFilters = tags.length > 0 || !!query;

  // Drop the shake timer if the component unmounts mid-wink so React
  // doesn't get a setState on an unmounted instance. A real concern
  // because route changes (which unmount the toolbar) can collide
  // with a fresh shake within the 400 ms window.
  useEffect(
    () => () => {
      if (shakeTimerRef.current !== null) clearTimeout(shakeTimerRef.current);
    },
    [],
  );

  return (
    <div className="toolbar">
      <span className="results">
        {t(count === 1 ? "toolbar.results.one" : "toolbar.results.many", { count })}
      </span>
      <button
        className={`clear-btn${clearShaking ? " is-shaking" : ""}`}
        disabled={!hasFilters}
        onClick={() => {
          if (!hasFilters) {
            // Wink — nothing to clear, but the user clicked anyway.
            setClearShaking(true);
            if (shakeTimerRef.current !== null) clearTimeout(shakeTimerRef.current);
            shakeTimerRef.current = setTimeout(() => {
              setClearShaking(false);
              shakeTimerRef.current = null;
            }, 400);
            return;
          }
          onReplace({ tags: [], query: "" });
        }}
      >
        {t("toolbar.clearFilters")}
      </button>
      {tags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tags.map((tag) => (
            <button
              key={tag}
              className="tag-chip active"
              onClick={() => onReplace({ tags: tags.filter((x) => x !== tag) })}
            >
              {tag} ×
            </button>
          ))}
        </div>
      )}
      <div className="toolbar-right">
        {/* Saved-views dropdown sits left of the sort select so the
            cluster reads as "your shortcuts → ordering". Only mount
            when the parent threads the full ViewState through; older
            callers (focused tests) opt out by omitting the prop. */}
        {viewState && <SavedViewsMenu state={viewState} notify={notify} />}
        <label htmlFor="sort-select" className="toolbar-label">
          {t("toolbar.sortLabel")}
        </label>
        <select
          id="sort-select"
          className="sort-select"
          value={sort}
          onChange={(e) => onReplace({ sort: e.target.value as SortOrder })}
        >
          <option value="recent">{t("toolbar.sort.recent")}</option>
          <option value="featured">{t("toolbar.sort.featured")}</option>
          <option value="title">{t("toolbar.sort.title")}</option>
        </select>
      </div>
    </div>
  );
}
