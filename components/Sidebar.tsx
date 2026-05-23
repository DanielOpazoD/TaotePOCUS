"use client";

import { CategoryGlyph, CustomCategoryGlyph, Icon } from "@/lib/icons";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useLanguage } from "@/hooks/useLanguage";
import { categoryLabel } from "@/lib/i18n";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { CategoryWithCount } from "@/lib/types";

interface Props {
  activeCat: string | null;
  setActiveCat: (c: string | null) => void;
  activeTags: string[];
  toggleTag: (t: string) => void;
  totalCount: number;
  categories: CategoryWithCount[];
  tags: string[];
  /** Collapse the sidebar to a thin rail. Persisted by the parent. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const TAGS_OPEN_KEY = STORAGE_KEYS.sidebarTagsOpen;

export default function Sidebar({
  activeCat,
  setActiveCat,
  activeTags,
  toggleTag,
  totalCount,
  categories,
  tags,
  collapsed,
  onToggleCollapsed,
}: Props) {
  const { lang, t } = useLanguage();
  // Tags section collapse state. Default open on first visit so
  // newcomers see the vocabulary; once collapsed, the choice persists.
  // Active tags force-open below so applied filters never go invisible.
  const [tagsOpen, setTagsOpen] = usePersistedState(TAGS_OPEN_KEY, true, {
    serialize: (v) => (v ? "1" : "0"),
    deserialize: (raw) => (raw === "1" ? true : raw === "0" ? false : undefined),
  });
  const toggleTagsOpen = () => setTagsOpen((prev) => !prev);
  // If the user has tags applied but collapsed the section, expand it
  // automatically — otherwise the active filter is invisible.
  const effectivelyOpen = tagsOpen || activeTags.length > 0;

  return (
    <aside className={`sidebar${collapsed ? " is-collapsed" : ""}`} aria-label={t("sidebar.aria")}>
      <div className="side-section sidebar-categories">
        {/* The collapse toggle now lives INSIDE the section header,
            in the same row as the "CATEGORÍAS" label. Pre-May-2026 it
            floated above the h4 as a circular standalone button — the
            user feedback was that it read as a UI dev placeholder
            ("feo y ordinario"), not as an integrated control. Inline
            with the label, sized as ghost chrome, the toggle becomes
            part of the panel rather than a sticker on top of it. */}
        <div className="side-section-header">
          <h4>{t("sidebar.categories")}</h4>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? t("sidebar.expand.aria") : t("sidebar.collapse.aria")}
            aria-expanded={!collapsed}
            title={collapsed ? t("sidebar.expand.title") : t("sidebar.collapse.title")}
          >
            {collapsed ? Icon.chevronRight() : Icon.chevronLeft()}
          </button>
        </div>
        <ul className="cat-list">
          <li>
            <button
              className={!activeCat ? "active" : ""}
              onClick={() => setActiveCat(null)}
              title={t("sidebar.todos")}
            >
              <span className="cat-label">
                <span className="cat-glyph" aria-hidden="true">
                  {Icon.search()}
                </span>
                <span className="cat-text">{t("sidebar.todos")}</span>
              </span>
              <span className="cat-count">{totalCount}</span>
            </button>
          </li>
          {categories.map((c) => {
            const label = categoryLabel(c, lang);
            return (
              <li key={c.id}>
                <button
                  className={activeCat === c.id ? "active" : ""}
                  onClick={() => setActiveCat(c.id)}
                  title={label}
                >
                  <span className="cat-label">
                    <span className="cat-glyph" aria-hidden="true">
                      {/* Built-in categories have hand-drawn glyphs in
                          `CategoryGlyph`. Custom (`c:*`) categories
                          created by the admin get the generic
                          `CustomCategoryGlyph` (a ring + tag) so they
                          don't render as a blank slot in the sidebar
                          nav. */}
                      {CategoryGlyph[c.id] ?? CustomCategoryGlyph}
                    </span>
                    <span className="cat-text">{label}</span>
                  </span>
                  <span className="cat-count">{c.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className={`side-section sidebar-tags${effectivelyOpen ? " is-open" : " is-closed"}`}>
        {/* Section header doubles as the collapse toggle. The chevron
            sits on the right of the label and rotates 90° when open.
            Clicking anywhere on the row toggles. */}
        <button
          type="button"
          className="side-section-toggle"
          onClick={toggleTagsOpen}
          aria-expanded={effectivelyOpen}
          aria-controls="sidebar-tags-cloud"
        >
          <span>{t("sidebar.tags")}</span>
          <span className="side-section-meta tnum">{tags.length}</span>
          <span className="side-section-chevron" aria-hidden="true">
            {Icon.arrowRight()}
          </span>
        </button>
        {effectivelyOpen && (
          <div className="tags-cloud" id="sidebar-tags-cloud">
            {tags.slice(0, 14).map((t) => (
              <button
                key={t}
                className={`tag-chip ${activeTags.includes(t) ? "active" : ""}`}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
