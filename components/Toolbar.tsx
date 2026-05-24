"use client";

import SavedViewsMenu from "./chrome/SavedViewsMenu";
import type { Difficulty, SortOrder, ViewState } from "@/lib/url";
import { useLanguage } from "@/hooks/useLanguage";

// `DIFFICULTY_OPTIONS` was the source list for the chip rail that
// got removed in May-2026 — see the comment in the render branch
// below. The `Difficulty` type stays imported because the `Props`
// shape still receives the URL-state value even though we no
// longer render the toggle UI.

interface Props {
  /** Number of results currently visible — drives the "N casos" copy. */
  count: number;
  /** Active tag filters; rendered as removable pills. */
  tags: string[];
  /** Active text query, used to enable/disable the clear-filters button. */
  query: string;
  /** Active sort order; the controlled value of the sort select. */
  sort: SortOrder;
  /** Active difficulty levels; rendered as a toggle rail. Empty = no
   *  filter. Multi-select / OR-combined (any-of) — matches the user's
   *  mental model of "show me Basic OR Intermediate". */
  difficulty: Difficulty[];
  /** "Solo no vistos" filter state — when true, the grid hides cases
   *  the user has already opened (tracked via `useSeenCases` in
   *  App.tsx). Local / per-device state, NOT URL-synced — sharing
   *  "your unseen cases" is meaningless. Optional so older callers
   *  / tests can omit the prop. */
  unseenOnly?: boolean;
  /** Flip the unseen-only state. Bound at the App level. */
  onToggleUnseenOnly?: () => void;
  /** Patch the URL with new filter values (replace, not push). */
  onReplace: (
    patch: Partial<{
      tags: string[];
      query: string;
      sort: SortOrder;
      difficulty: Difficulty[];
    }>,
  ) => void;
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
export default function Toolbar({
  // `count`, `query`, `difficulty` left in `Props` for parity with
  // the App.tsx call site — destructured-out here because the
  // results count + Clear-filters button + difficulty toggle row
  // they powered were all removed in the May-2026 minimalist pass.
  // Keep the props plumbed through so a future restore (or a third-
  // party consumer of this component) doesn't have to thread them
  // again from scratch.
  tags,
  sort,
  onReplace,
  viewState,
  notify,
  unseenOnly,
  onToggleUnseenOnly,
}: Props) {
  const { t } = useLanguage();
  // The `clearShaking` wink-animation state + `hasFilters` derived flag
  // both lived here for the "Limpiar filtros" button. Removed with that
  // button in the May-2026 minimalist pass — the wink was a clever
  // touch but cleared via the per-tag-chip × button + the search-input
  // clear-icon already cover the action, and the standalone button was
  // visual chrome on the daily-driver surface.

  return (
    <div className="toolbar">
      {/* Results count + Clear-filters button both removed in the
          May-2026 minimalist pass. The count was redundant with the
          sidebar (which already shows a per-category count next to
          each label); the clear button was rare-use chrome cluttering
          the daily-driver toolbar. Tag chips (below) are still
          individually-removable; the sort select is now the only
          non-state-restoring control here. */}
      {/* The difficulty chip rail (Basic / Intermediate / Advanced)
          was removed from the public toolbar in May-2026. The
          difficulty data is still set by admins via AdminThumbMenu
          and the URL state still accepts `?difficulty=...` for
          bookmarks, but no UI surface exposes the toggle to public
          readers — the difficulty signal was adding visual noise
          without informing the read experience for a sonography
          reference catalog. */}
      {tags.length > 0 && (
        <div className="toolbar-tags-row">
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
        {/* "Solo no vistos" toggle — first in the right cluster
            because it's the most personal filter and reads best on
            its own. Renders only when the App threads the handler
            (older callers / focused tests can stay minimal). Pure
            visual button; the state is per-device localStorage,
            never URL-synced. See `useSeenCases` for the storage
            schema. */}
        {onToggleUnseenOnly && (
          <button
            type="button"
            className={`toolbar-toggle${unseenOnly ? " is-active" : ""}`}
            onClick={onToggleUnseenOnly}
            aria-pressed={unseenOnly}
            title={t(
              unseenOnly ? "toolbar.unseenOnly.activeTitle" : "toolbar.unseenOnly.inactiveTitle",
            )}
          >
            {t("toolbar.unseenOnly.label")}
          </button>
        )}
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
