"use client";

import dynamic from "next/dynamic";
import { CaseCard } from "./cards";
import EmptyState from "./EmptyState";
import type { CaseRecord, Category, SectionId, View } from "@/lib/types";

// AdminPanel is admin-only chrome; lazy-load so its tree stays out of
// the public-route bundles.
const AdminPanel = dynamic(() => import("./admin/AdminPanel"), { ssr: false });

interface UserCasesShape {
  live: CaseRecord[];
  trashed: CaseRecord[];
  // The repo facade returns a boolean (success / failure). We forward
  // it untouched so the admin panel can surface failures if it wants.
  restore: (c: CaseRecord) => Promise<boolean>;
  purge: (c: CaseRecord) => Promise<boolean>;
}

interface Props {
  /** Current view from URL (drives the admin / favs / section branch). */
  view: View;
  /** Active category filter (drives empty-state CTA copy). */
  cat: string | null;
  /** Active tag filters (drives empty-state CTA copy). */
  tags: string[];
  /** Active text query (drives empty-state CTA copy). */
  query: string;
  /** Whether the current user is the admin (gates the AdminPanel render). */
  isAdmin: boolean;
  /** Cases after all filters applied — what we actually render. */
  filtered: CaseRecord[];
  /** Case set for the admin panel (pre-filter, pre-deletion). */
  allCases: CaseRecord[];
  /** Live + trashed user-uploaded cases for the admin panel. */
  userCases: UserCasesShape;
  /** Soft-deleted seed/imported cases (admin trash) — surfaced in
   *  AdminPanel with a Restore button. Computed in App.tsx from the
   *  override map. Empty array when the admin hasn't deleted any. */
  trashedImports?: CaseRecord[];
  /** Restore a soft-deleted seed/imported case (drops the
   *  `deletedAt` override). */
  onRestoreImport?: (c: CaseRecord) => void;
  /** Permanent-delete an imported case (irreversible). Removes the
   *  metadata override, writes a `purged` tombstone, and deletes the
   *  blob from the media store. */
  onPurgeImport?: (c: CaseRecord) => void;
  /** Categories list (built-in + custom) — passed through to the
   *  classifier and the categories editor. */
  categories?: Category[];
  /** Cases-per-category counter, indexed by category id. Feeds the
   *  categories editor's "in use" hint. */
  categoryCaseCounts?: Record<string, number>;
  /** Categories CRUD callbacks. Wired to `useCustomCategories`. */
  onAddCategory?: (label: string) => Promise<Category | null>;
  onRenameCategory?: (id: string, label: string) => Promise<boolean>;
  onRemoveCategory?: (id: string) => Promise<boolean>;
  /** Predicate — is this id a runtime-defined custom category? */
  isCustomCategory?: (id: string) => boolean;
  /** Predicate / setter for the visibility of a category in the
   *  public sidebar. Built-ins and custom alike can be hidden. */
  isCategoryHidden?: (id: string) => boolean;
  onSetCategoryHidden?: (id: string, hidden: boolean) => void;
  /** Predicate / setter for section visibility in the top nav and
   *  mobile drawer. Forwarded to the AdminPanel "Secciones" tab. */
  isSectionHidden?: (id: SectionId) => boolean;
  onSetSectionHidden?: (id: SectionId, hidden: boolean) => void;
  /** Resolve / set the user-facing label for a section. Wired in
   *  App.tsx to `useSectionLabels`. */
  getSectionLabel?: (id: SectionId, fallback: string) => string;
  onSetSectionLabel?: (id: SectionId, label: string) => void;
  /** Cases-per-section counter, indexed by section id. Powers the
   *  "N casos" hint in the Secciones editor. */
  sectionCaseCounts?: Record<string, number>;
  /** Email of the current admin (used to tag backup envelopes). */
  currentEmail?: string | null;
  /** Toast surface — forwarded to AdminPanel's BackupPanel for
   *  export/import feedback. */
  notify?: (msg: string) => void;
  /** Favorites set for star-marking in the grid. */
  favs: string[];

  onOpen: (c: CaseRecord) => void;
  onToggleFav: (c: CaseRecord) => void;
  onEdit: (c: CaseRecord) => void;
  onDelete: (c: CaseRecord) => void;
  onNew: () => void;
  /** Patch the URL — used by EmptyState's "clear filters" CTA. */
  onClearFilters: () => void;
  /** Send the user to /atlas — used by the favs empty-state CTA. */
  onExploreAtlas: () => void;
  /** Apply a partial override to a case — used by the AdminPanel's
   *  bulk classifier (drag a thumbnail onto a section/category). */
  onPatch?: (id: string, patch: Partial<CaseRecord>) => void;
  /** Apply the same patch to many cases at once. Used by the
   *  classifier's multi-select bulk bar; the parent shows a single
   *  undo toast that reverses every change as a unit. */
  onBulkPatch?: (ids: string[], patch: Partial<CaseRecord>) => void;
  /** Soft-delete every selected case at once. Used by the
   *  classifier's bulk bar. Skips the per-card confirm; the parent
   *  shows a unified undo toast. */
  onBulkSoftDelete?: (ids: string[]) => void;
}

/**
 * Decides what fills the main column based on view + filter state and
 * delegates to the right sub-tree. Three branches:
 *
 *   1. Admin route (and the user is admin) → `<AdminPanel>`
 *   2. Filter yields zero results          → `<EmptyState>` with a
 *      contextual CTA (clear filters / explore atlas / nothing)
 *   3. Otherwise                           → uniform `.case-grid`
 *
 * The Atlas landing used to special-case into a Bento layout (one
 * 2×2 hero + interleaved QuoteCards). User feedback in May-2026
 * asked for the catalog to read as a single uniform thumbnail grid
 * across every section — same vocabulary as the admin classifier
 * — so the hero and quote chrome were dropped. Atlas now falls
 * through to branch 3 like every other section.
 *
 * Extracted from App.tsx so the rendering branch isn't a 60-line
 * nested ternary inside the JSX. The branching is the same; this just
 * gives it a name.
 */
export default function MainGrid({
  view,
  cat,
  tags,
  query,
  isAdmin,
  filtered,
  allCases,
  userCases,
  trashedImports,
  onRestoreImport,
  onPurgeImport,
  categories,
  categoryCaseCounts,
  onAddCategory,
  onRenameCategory,
  onRemoveCategory,
  isCustomCategory,
  isCategoryHidden,
  onSetCategoryHidden,
  isSectionHidden,
  onSetSectionHidden,
  getSectionLabel,
  onSetSectionLabel,
  sectionCaseCounts,
  currentEmail,
  notify,
  favs,
  onOpen,
  onToggleFav,
  onEdit,
  onDelete,
  onNew,
  onClearFilters,
  onExploreAtlas,
  onPatch,
  onBulkPatch,
  onBulkSoftDelete,
}: Props) {
  if (view.kind === "admin" && isAdmin) {
    return (
      <AdminPanel
        allCases={allCases}
        userCases={userCases.live}
        trashedCases={userCases.trashed}
        trashedImports={trashedImports}
        categories={categories}
        categoryCaseCounts={categoryCaseCounts}
        onAddCategory={onAddCategory}
        onRenameCategory={onRenameCategory}
        onRemoveCategory={onRemoveCategory}
        isCustomCategory={isCustomCategory}
        isCategoryHidden={isCategoryHidden}
        onSetCategoryHidden={onSetCategoryHidden}
        isSectionHidden={isSectionHidden}
        onSetSectionHidden={onSetSectionHidden}
        getSectionLabel={getSectionLabel}
        onSetSectionLabel={onSetSectionLabel}
        sectionCaseCounts={sectionCaseCounts}
        currentEmail={currentEmail}
        notify={notify}
        onEdit={onEdit}
        onDelete={onDelete}
        onRestore={userCases.restore}
        onPurge={userCases.purge}
        onRestoreImport={onRestoreImport}
        onPurgeImport={onPurgeImport}
        onNew={onNew}
        onPatch={onPatch}
        onBulkPatch={onBulkPatch}
        onBulkSoftDelete={onBulkSoftDelete}
      />
    );
  }

  if (filtered.length === 0) {
    // CTA picked by what's empty and why. Filters active → offer to
    // clear them. Favs view empty → send the user to the atlas. No
    // useful action otherwise — empty state is a graceful dead end.
    const action =
      view.kind === "favs"
        ? { label: "Explorar el atlas", onClick: onExploreAtlas }
        : cat || tags.length > 0 || query.trim()
          ? { label: "Limpiar filtros", onClick: onClearFilters }
          : undefined;
    return <EmptyState view={view} action={action} />;
  }

  // Atlas landing falls through to the uniform `case-grid` below —
  // the Bento hero was removed in May-2026 (see file header).
  return (
    <div className="case-grid">
      {filtered.map((c) => (
        <CaseCard
          key={c.id}
          caso={c}
          isFav={favs.includes(c.id)}
          onFav={() => onToggleFav(c)}
          onOpen={() => onOpen(c)}
          // Admin-only hover delete chips. Both stop propagation in the
          // CaseCard so they don't trigger onOpen.
          onDelete={isAdmin ? () => onDelete(c) : undefined}
          onPurge={isAdmin && onPurgeImport ? () => onPurgeImport(c) : undefined}
          // Admin-only quick-reclassify chip + popover.
          onPatch={isAdmin ? onPatch : undefined}
          categories={isAdmin ? categories : undefined}
        />
      ))}
    </div>
  );
}
