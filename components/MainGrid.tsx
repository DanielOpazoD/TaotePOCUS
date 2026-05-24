"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { CaseCard } from "./cards";
import { CaseCardSkeleton } from "./CaseCardSkeleton";
import { CatalogPagination } from "./CatalogPagination";
import EmptyState from "./EmptyState";
import { AdminPanelSkeleton } from "./admin/AdminPanelSkeleton";
import { useT } from "@/hooks/useLanguage";
import type { RelaxationSuggestion } from "@/lib/filter-suggestions";
import type {
  CaseRecord,
  Category,
  FocusDefaults,
  FocusValue,
  LocalizedString,
  SectionId,
  View,
} from "@/lib/types";
import type { ViewPatch } from "@/lib/url";

// AdminPanel is admin-only chrome; lazy-load so its tree stays out of
// the public-route bundles. The `loading` fallback paints a skeleton
// while the chunk is in flight — previously it was `null`, which left
// /admin visually empty for 1-5s on a cold cache (RUM showed 5s p75
// LCP). The skeleton reserves the layout space and gives the browser
// something to paint, and the chunk can be pre-warmed via
// `preloadAdminPanel()` from the header's hover/focus handlers (see
// `components/admin/preload.ts`).
const AdminPanel = dynamic(() => import("./admin/AdminPanel"), {
  ssr: false,
  loading: () => <AdminPanelSkeleton />,
});

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
  onAddCategory?: (label: string | LocalizedString) => Promise<Category | null>;
  onRenameCategory?: (id: string, label: string | LocalizedString) => Promise<boolean>;
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
   *  App.tsx to `useSectionLabels`. Phase-3 i18n widened the setter
   *  to accept an optional language slot ("es" | "en"). */
  getSectionLabel?: (id: SectionId, fallback: string) => string;
  onSetSectionLabel?: (id: SectionId, label: string, slot?: "es" | "en") => void;
  /** Raw section label override map — passed to AdminPanel so the
   *  Secciones editor can render the EN slot value alongside ES. */
  sectionLabelOverrides?: Partial<Record<SectionId, LocalizedString>>;
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
  /** Set of case ids the current user has opened at least once on
   *  this device. Drives the subtle "seen" indicator on each
   *  `<CaseCard>`. Defaults to an empty Set when omitted so older
   *  callers (focused tests) don't need to thread it. */
  seenIds?: Set<string>;

  onOpen: (c: CaseRecord) => void;
  onToggleFav: (c: CaseRecord) => void;
  onEdit: (c: CaseRecord) => void;
  onDelete: (c: CaseRecord) => void;
  onNew: () => void;
  /** Patch the URL — used by EmptyState's "clear filters" CTA. */
  onClearFilters: () => void;
  /** Send the user to /atlas — used by the favs empty-state CTA. */
  onExploreAtlas: () => void;
  /** Per-filter relaxation suggestions, computed by the parent when
   *  the filtered set is empty. Each carries the count of cases the
   *  relaxation would yield + a patch the chip applies via
   *  `onApplySuggestion`. Optional / empty → EmptyState falls back
   *  to the plain "clear all filters" CTA. */
  suggestions?: RelaxationSuggestion[];
  /** Apply one suggestion's patch — routed to `replacePatch` upstream. */
  onApplySuggestion?: (patch: ViewPatch) => void;
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
  /** Current 0-indexed page from URL state. The grid renders a
   *  slice of `filtered` corresponding to this page. */
  page: number;
  /** Patch the URL's `page` param. Used by the pagination control. */
  onPageChange: (page: number) => void;
  /** Admin-managed thumbnail focus defaults (global / per-section /
   *  per-category). Forwarded to every `<CaseCard>` so the card can
   *  resolve the effective focus per case. Forwarded to AdminPanel
   *  too so the focus-defaults editor can read + write the same blob.
   *  Optional — when absent the cards use only `caso.focus`. */
  focusDefaults?: FocusDefaults;
  /** Setter wired to `useFocusDefaults().setGlobal` — the AdminPanel
   *  surfaces a dedicated tab for editing this. Optional alongside
   *  the read-only `focusDefaults`. */
  onSetFocusGlobal?: (value: FocusValue | undefined) => void;
  /** Setter wired to `useFocusDefaults().setSection`. */
  onSetFocusSection?: (id: SectionId, value: FocusValue | undefined) => void;
  /** Setter wired to `useFocusDefaults().setCategory`. */
  onSetFocusCategory?: (id: string, value: FocusValue | undefined) => void;
  /** Wipe every focus-default slot (global + sections + categories). */
  onResetFocusDefaults?: () => void;
  /** `true` while the async seed-cases chunk is still loading.
   *  Drives the skeleton-grid render path that reserves the right
   *  layout space so the chunk landing doesn't trigger CLS. */
  seedLoading?: boolean;
}

/** How many cases per page in the public catalog grid. Hardcoded
 *  for now; if it ever needs to be configurable per-section the
 *  pageSize moves into the URL state too. */
const CATALOG_PAGE_SIZE = 30;

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
  sectionLabelOverrides,
  sectionCaseCounts,
  currentEmail,
  notify,
  favs,
  seenIds,
  onOpen,
  onToggleFav,
  onEdit,
  onDelete,
  onNew,
  onClearFilters,
  suggestions,
  onApplySuggestion,
  onExploreAtlas,
  onPatch,
  onBulkPatch,
  onBulkSoftDelete,
  page,
  onPageChange,
  focusDefaults,
  onSetFocusGlobal,
  onSetFocusSection,
  onSetFocusCategory,
  onResetFocusDefaults,
  seedLoading,
}: Props) {
  // Hooks first — Rules of Hooks. The early returns for the admin /
  // empty branches don't render the grid below, but `useMemo` still
  // has to be called every render to keep the hook order stable.
  //
  // Set-backed favorites lookup: O(1) per card vs `favs.includes`'s
  // O(N). With ~300 cases × ~30 favs the array form was ~9k ops per
  // render; the Set form is ~300. The Set is rebuilt only when the
  // favs list itself changes identity (toggling a heart), not on
  // category navigation.
  const t = useT();
  const favSet = useMemo(() => new Set(favs), [favs]);

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
        sectionLabelOverrides={sectionLabelOverrides}
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
        focusDefaults={focusDefaults}
        onSetFocusGlobal={onSetFocusGlobal}
        onSetFocusSection={onSetFocusSection}
        onSetFocusCategory={onSetFocusCategory}
        onResetFocusDefaults={onResetFocusDefaults}
      />
    );
  }

  // While the seed-cases chunk is loading, the public catalog views
  // render skeleton placeholders INSTEAD of falling into the
  // empty-state branch below. This reserves the layout space the
  // real cards will occupy → the chunk landing replaces skeletons
  // in-place rather than growing the 0px grid to ~2900px (the
  // dominant CLS contributor before this).
  //
  // **Section gate**: only for sections the imported corpus actually
  // fills (atlas + ecg). /cases and /info historically ship empty
  // (their content is editorial, not imported); their EmptyState
  // illustration IS the real render. Showing 30 skeletons mid-load
  // just to collapse to EmptyState would cause a WORSE CLS than no
  // skeletons at all (~7000px shrink shift). /rayos same posture.
  //
  // No filters / search active either — those are genuinely "no
  // results" cases that should show the empty state regardless of
  // seed-loading state.
  const isPlainSectionView = view.kind === "section" && !cat && tags.length === 0 && !query.trim();
  const sectionLikelyHasContent =
    view.kind === "section" && (view.section === "atlas" || view.section === "ecg");
  // Favs view gets skeletons too while seed is loading IF the user
  // has any favorites stored — `favs` lives in localStorage and is
  // available before `allCases` is, so we KNOW there should be N
  // cases on the page even before the seed corpus resolves. Without
  // this branch the favs page would briefly flash the EmptyState
  // "no favs yet" illustration during the seed-load window even for
  // users who definitely have favs — confusing.
  const favsViewWithSavedFavs = view.kind === "favs" && favs.length > 0 && filtered.length === 0;
  if (seedLoading && favsViewWithSavedFavs) {
    const skeletonCount = Math.min(favs.length, CATALOG_PAGE_SIZE);
    return (
      <div className="case-grid">
        {Array.from({ length: skeletonCount }, (_, i) => (
          <CaseCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (seedLoading && isPlainSectionView && sectionLikelyHasContent && filtered.length === 0) {
    // Render CATALOG_PAGE_SIZE skeletons (= one full page worth)
    // so the grid's height matches the eventual real grid exactly,
    // regardless of section. /ecg uses a 2-column layout (15 rows
    // per page); /info uses 3-column (10 rows); /atlas uses 5-col
    // (6 rows). 12 skeletons covered Atlas's above-the-fold but
    // not the others — real cards growing from 12 to 30 produced
    // CLS = 0.3+ on /ecg, /cases, /info. Empty divs are cheap;
    // matching the full page eliminates the shift on every section.
    return (
      <div className="case-grid">
        {Array.from({ length: CATALOG_PAGE_SIZE }, (_, i) => (
          // react-doctor-disable-next-line react-doctor/no-array-index-as-key
          <CaseCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    // CTA picked by what's empty and why. Filters active → offer to
    // clear them. Favs view empty → send the user to the atlas. No
    // useful action otherwise — empty state is a graceful dead end.
    const action =
      view.kind === "favs"
        ? { label: t("empty.action.exploreAtlas"), onClick: onExploreAtlas }
        : cat || tags.length > 0 || query.trim()
          ? { label: t("empty.action.clearFilters"), onClick: onClearFilters }
          : undefined;
    // Per-filter relaxation chips, computed upstream. The EmptyState
    // renders them above the "Clear all" CTA so the user can see
    // which single drop would unlock content — converts a dead-end
    // into a discovery.
    const safeSuggestions = suggestions ?? [];
    return (
      <EmptyState
        view={view}
        action={action}
        suggestions={safeSuggestions.length > 0 ? safeSuggestions : undefined}
        onApplySuggestion={onApplySuggestion}
      />
    );
  }

  // Conditionally bind the admin callbacks ONCE per parent render so
  // every CaseCard receives the same function reference. This is the
  // companion to the CaseCard.memo wrap: identical refs → memo
  // short-circuits → only the cards that actually entered/left the
  // filtered set re-render on a category click.
  const cardOnDelete = isAdmin ? onDelete : undefined;
  const cardOnPurge = isAdmin && onPurgeImport ? onPurgeImport : undefined;
  const cardOnPatch = isAdmin ? onPatch : undefined;
  const cardCategories = isAdmin ? categories : undefined;

  // Pagination — slice `filtered` to the active page
  // (CATALOG_PAGE_SIZE cases per page). The 0-indexed `page` arrives
  // from URL state; the pagination control below patches the URL on
  // prev / next / jump. We clamp `page` defensively so a stale URL
  // (`?page=10` after a category change shrinks the result set)
  // doesn't render a blank grid — clamp to the last valid page when
  // the user lands on something out of range.
  const totalPages = Math.max(1, Math.ceil(filtered.length / CATALOG_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const pageStart = safePage * CATALOG_PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + CATALOG_PAGE_SIZE);

  // Atlas landing falls through to the uniform `case-grid` below —
  // the Bento hero was removed in May-2026 (see file header).
  //
  // `priority` flag goes onto the FIRST card only (the LCP candidate).
  // Earlier passes set it on the first 6 cards intending to "eager
  // load above-the-fold" — but with `fetchpriority="high"` on six
  // images at once, the browser serialises them and they fight for
  // bandwidth, which actually slows the LCP element. RUM showed
  // p75 LCP of 2.6s on `/` (just over the 2.5s threshold); the most
  // direct lever is to focus the high-priority hint on the single
  // element that LCP actually measures. The remaining 5 above-the-
  // fold cards stay normal-priority + eager (Next/Image's default
  // for cards in the viewport), so they still load fast but don't
  // crowd the LCP fetch.
  //
  // Reference: web.dev/articles/optimize-lcp — "Only one image per
  // page should typically use the priority hint."
  return (
    <>
      <div className="case-grid">
        {paged.map((c, i) => (
          <CaseCard
            key={c.id}
            caso={c}
            isFav={favSet.has(c.id)}
            isSeen={seenIds?.has(c.id) ?? false}
            onFav={onToggleFav}
            onOpen={onOpen}
            onDelete={cardOnDelete}
            onPurge={cardOnPurge}
            onPatch={cardOnPatch}
            categories={cardCategories}
            priority={i === 0}
            // Pass the trimmed query through so the card can wrap
            // matches in <mark>. The string is empty-or-stable per
            // render so React.memo keeps short-circuiting unaffected
            // cards (only cards whose `query` actually changed
            // re-render — same set affected by the filter anyway).
            searchQuery={query.trim() || undefined}
            focusDefaults={focusDefaults}
          />
        ))}
      </div>
      <CatalogPagination
        page={safePage}
        totalPages={totalPages}
        total={filtered.length}
        pageSize={CATALOG_PAGE_SIZE}
        onPageChange={onPageChange}
      />
    </>
  );
}
