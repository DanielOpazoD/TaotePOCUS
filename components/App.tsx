"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import SectionHero from "./SectionHero";
import Toolbar from "./Toolbar";
import MainGrid from "./MainGrid";
import ErrorBoundary from "./ErrorBoundary";
import { Header, Footer } from "./chrome";
import ToastHost from "./chrome/ToastHost";
import AppModals from "./AppModals";
import { derivePageHead } from "@/lib/headers";
import type { CaseRecord } from "@/lib/types";
import { useViewState } from "@/hooks/useViewState";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useToast } from "@/hooks/useToast";
import { useSession } from "@/hooks/useSession";
import { useFavs } from "@/hooks/useFavs";
import { useUserCases } from "@/hooks/useUserCases";
import { useCaseFilters } from "@/hooks/useCaseFilters";
import { useShortcuts } from "@/hooks/useShortcuts";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useCaseOverrides } from "@/hooks/useCaseOverrides";
import { useCustomCategories } from "@/hooks/useCustomCategories";
import { useHiddenSections } from "@/hooks/useHiddenSections";
import { useSectionLabels } from "@/hooks/useSectionLabels";
import { useMergedCatalog } from "@/hooks/useMergedCatalog";
import { useAdminPipeline } from "@/hooks/useAdminPipeline";
import { useAdminActions } from "@/hooks/useAdminActions";
import { STORAGE_KEYS } from "@/lib/storage-keys";

// Lazy-loaded subtrees: needed only on a specific path. Keeping them out
// of the initial bundle preserves first-paint on the home grid (audit
// §9). AdminPanel is lazy-loaded inside MainGrid so it doesn't appear
// here. Modal subtrees (CaseForm, PresentationMode, ConfirmDialog,
// ShortcutsModal, PWAStatus, AuthModal) live inside `<AppModals>` so the
// orchestrator's import surface stays lean.
const FeaturedRow = dynamic(() => import("./cards/FeaturedRow"));
const MobileDrawer = dynamic(() => import("./chrome/MobileDrawer"), { ssr: false });

export default function App() {
  return (
    <Suspense fallback={null}>
      <AppInner />
    </Suspense>
  );
}

function AppInner() {
  const {
    view,
    cat,
    tags,
    query,
    sort,
    caso: openCaseId,
    presenting: presentingId,
    pushPatch,
    replacePatch,
  } = useViewState();

  // Cross-cutting state owned by hooks. Each one is a small, named
  // responsibility — see `hooks/use*.ts` for behavior.
  const { toast, showToast } = useToast();
  const { user, isAdmin, hydrated, login, logout } = useSession({ notify: showToast });
  const [authOpen, setAuthOpen] = useState(false);
  const { favs, toggle: toggleFav } = useFavs(user, hydrated, {
    onAnonymous: () => setAuthOpen(true),
    notify: showToast,
  });
  const userCases = useUserCases(user, hydrated, { notify: showToast });

  // Truly transient UI state. None of this belongs in the URL.
  const [editingCase, setEditingCase] = useState<CaseRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Sidebar collapse — persisted via usePersistedState. Compact "1"/"0"
  // serialization keeps the localStorage value short and grep-friendly.
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState(
    STORAGE_KEYS.sidebarCollapsed,
    false,
    {
      serialize: (v) => (v ? "1" : "0"),
      deserialize: (raw) => (raw === "1" ? true : raw === "0" ? false : undefined),
    },
  );
  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev);

  // Global keyboard shortcuts. The hook installs window listeners for
  // j/k, g+letter and `?`. The `/` shortcut for the search box lives
  // in the Header, co-located with the input it focuses.
  useShortcuts({ onHelp: () => setShortcutsOpen(true) });

  // Filter persistence between sessions. When the URL comes back
  // clean (no cat / tags / query / sort) and storage has filters
  // for the current section, the hook re-applies them silently via
  // replacePatch. Per-section storage so a "Cardíaco" filter from
  // Atlas doesn't cross-contaminate ECG.
  usePersistedFilters({ view, cat, tags, query, sort, replacePatch });

  // The DB-mirror failure toast (`useMirrorFailureToast`) was
  // removed in ADR-0011. The previous fire-and-forget write path
  // could land local + miss DB, leaving a "syncing" zombie state
  // that the toast surfaced. Stage 4-partial makes writes await
  // the DB and return its failure synchronously, so the zombie
  // case can no longer happen.

  // Per-case overrides — admin-edited fields persisted in localStorage.
  // Merged on top of the source catalog at render time so a future
  // re-import (apply-twitter-import.mjs) doesn't blow away admin edits.
  // `clearOverride` was consumed by the modal "Restaurar original"
  // button, removed in May-2026. Kept the hook destructure name as
  // `_clearOverride` so the linter is happy and we don't lose the
  // export contract for future use.
  const { overrides, setOverride } = useCaseOverrides();

  // Admin-managed categories. The hook returns the full `categories`
  // list (built-in + custom, including hidden) for the Categories
  // editor. `isHidden` / `setHidden` drive the visibility toggle that
  // lets the admin trim the public sidebar nav without deleting
  // anything from the catalog.
  const {
    categories,
    addCategory,
    renameCategory,
    removeCategory,
    restoreCategory,
    isCustom: isCustomCategory,
    isHidden: isCategoryHidden,
    setHidden: setCategoryHidden,
  } = useCustomCategories();

  // Section visibility — admin toggle that filters the top nav and
  // the mobile drawer. The four sections are atlas / ecg / cases /
  // info. Defaults to `["cases"]` hidden on first visit per the
  // May-2026 product decision; the admin un-hides via Administrar →
  // Secciones and the choice is persisted in localStorage.
  //
  // Hidden sections still resolve via direct URL — only the nav
  // chrome filters them — so deep links keep working.
  const {
    visibleSections,
    isHidden: isSectionHidden,
    setHidden: setSectionHidden,
  } = useHiddenSections();

  // Section label overrides — admin can rename "Casos clínicos" to
  // anything they want for their own visitors. Pure cosmetic; ids
  // and URL paths are unchanged. Stored in localStorage; SEO
  // surfaces (sitemap, OG metadata) keep using the static defaults.
  const {
    overrides: sectionLabelOverrides,
    getLabel: getSectionLabel,
    setLabel: setSectionLabel,
    sectionsWithLabels,
  } = useSectionLabels();

  // Compose: hide-set ∩ label-overrides. Header / MobileDrawer
  // get the relabeled subset; the SectionsEditor below sees the
  // raw SECTIONS via its own catalog import.
  const visibleSectionsWithLabels = useMemo(
    () => visibleSections.map((s) => ({ ...s, label: sectionLabelOverrides[s.id] ?? s.label })),
    [visibleSections, sectionLabelOverrides],
  );
  void sectionsWithLabels; // sister export, currently unused at this layer (Header reads from `visibleSectionsWithLabels` instead)

  // Wrap the three category mutations with undo-toast surfacing.
  // The hook itself stays free of toast concerns (so non-admin
  // contexts that consume it never accidentally show a toast); the
  // app composes the affordances here.
  //
  //   - addCategory: success → "Categoría agregada" toast (no
  //     undo — `removeCategory` IS the inverse and is one click
  //     away in the editor row that just appeared).
  //   - renameCategory: success → toast with undo to the previous
  //     label.
  //   - removeCategory: success → toast with undo via
  //     `restoreCategory`. Failure → "no se pudo eliminar" toast.
  const onAddCategory = async (label: string) => {
    const created = await addCategory(label);
    if (created) showToast(`Categoría "${created.label}" agregada`);
    return created;
  };
  const onRenameCategory = async (id: string, label: string) => {
    const before = categories.find((c) => c.id === id);
    const ok = await renameCategory(id, label);
    if (ok && before && before.label !== label) {
      showToast("Categoría renombrada", {
        undo: () => renameCategory(id, before.label),
      });
    }
    return ok;
  };
  const onRemoveCategory = async (id: string) => {
    const before = categories.find((c) => c.id === id);
    const ok = await removeCategory(id);
    if (ok && before) {
      showToast(`"${before.label}" eliminada`, {
        undo: () => restoreCategory(before),
      });
    } else if (!ok) {
      showToast("No se pudo eliminar la categoría");
    }
    return ok;
  };

  // Catalog derivation (allCases / trashedImports / categoryCaseCounts).
  // Lives in `useMergedCatalog` so the merge + filter rules have one
  // home and App.tsx isn't directly hosting three side-by-side memos.
  const { allCases, trashedImports, categoryCaseCounts } = useMergedCatalog({
    userCasesLive: userCases.live,
    overrides,
  });

  const {
    scopedCases,
    sectionCategories: rawSectionCategories,
    sectionTags,
    filtered,
  } = useCaseFilters({
    allCases,
    favs,
    view,
    cat,
    tags,
    query,
    sort,
  });

  // Public sidebar / hero exclude any category the admin hid from the
  // Atlas POCUS view. Cases assigned to a hidden category still
  // exist (filterable via search / direct URL); they just don't
  // surface in the nav rail.
  const sectionCategories = useMemo(
    () => rawSectionCategories.filter((c) => !isCategoryHidden(c.id)),
    [rawSectionCategories, isCategoryHidden],
  );

  // Case-count-per-section, surfaced in the admin Secciones editor as
  // a "N casos" hint so the admin can see what they're hiding before
  // clicking. Soft-deleted cases are excluded — they're already
  // invisible to the public view.
  const sectionCaseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of allCases) {
      if (c.deletedAt) continue;
      counts[c.section] = (counts[c.section] ?? 0) + 1;
    }
    return counts;
  }, [allCases]);

  const openCase = useMemo<CaseRecord | null>(
    () => (openCaseId ? (allCases.find((c) => c.id === openCaseId) ?? null) : null),
    [allCases, openCaseId],
  );
  const presentingCase = useMemo<CaseRecord | null>(
    () => (presentingId ? (allCases.find((c) => c.id === presentingId) ?? null) : null),
    [allCases, presentingId],
  );

  const onShare = (c: CaseRecord) => {
    const url = `${location.origin}${location.pathname}?caso=${c.id}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
    showToast("Enlace copiado");
  };

  const onSaveCase = async (data: CaseRecord) => {
    // Two save paths share this form:
    //   1. Admin-uploaded cases (live in `userCases`) → repo.cases CRUD.
    //   2. Imported / seed cases the admin reclassified → per-case
    //      override map (admin edit doesn't mutate the upstream file).
    const isUserOwned = userCases.live.some((c) => c.id === data.id);
    let ok: boolean;
    if (isUserOwned || !editingCase) {
      // New case (no editingCase → fresh upload) or editing an existing
      // admin-owned case both go through the repo CRUD.
      ok = await userCases.save(data, { isUpdate: !!editingCase?.id });
    } else {
      // Editing a seed/imported case → save as override.
      ok = await setOverride(data.id, data);
      if (ok) showToast("Caso editado · puedes descartar desde el modal");
    }
    if (!ok) return;
    setFormOpen(false);
    setEditingCase(null);
  };

  // Per-case + bulk admin actions (override + undo toast pipelines).
  // Lifted out of App.tsx in May-2026 — they were 140 LOC of inline
  // closures inside the JSX, which made admin behavior un-testable
  // and the file unreadable. The hook is gated by the caller
  // (`isAdmin ? adminActions.onPatch : undefined`).
  const adminActions = useAdminActions({
    allCases,
    userCases,
    setOverride,
    showToast,
    user,
  });

  // Destructive flows (soft-delete + permanent-delete + restore).
  // The hook owns the pending-state and the side-effect ordering;
  // the parent only renders ConfirmDialogs bound to its pending refs.
  const adminPipeline = useAdminPipeline({
    user,
    userCases,
    setOverride,
    showToast,
    openCaseId,
    closeOpenCase: () => replacePatch({ caso: null }),
  });

  const onNewCase = () => {
    setEditingCase(null);
    setFormOpen(true);
  };
  const onEditCase = (c: CaseRecord) => {
    setEditingCase(c);
    setFormOpen(true);
  };

  // Stable per-card callbacks for the catalog grid.
  //
  // These wrap the URL-patch / fav-toggle calls so the SAME function
  // identity flows down to MainGrid → CaseCard on every render.
  // Without `useCallback` here, a category click recreates the
  // closures, which then cascade into every CaseCard's props and
  // defeat the `React.memo` wrap. Combined effect: ~50× speedup on
  // navigation between Atlas categories.
  //
  // The deps are intentionally stable too — `pushPatch` /
  // `replacePatch` come from `useViewState` which already
  // `useCallback`s them, and `toggleFav` from `useFavs` likewise.
  const onCardOpen = useCallback((c: CaseRecord) => pushPatch({ caso: c.id }), [pushPatch]);
  const onCardToggleFav = useCallback((c: CaseRecord) => toggleFav(c.id), [toggleFav]);
  const onClearFiltersCb = useCallback(
    () => replacePatch({ cat: null, tags: [], query: "" }),
    [replacePatch],
  );
  const onExploreAtlasCb = useCallback(
    () => replacePatch({ view: { kind: "section", section: "atlas" } }),
    [replacePatch],
  );

  const head = derivePageHead(view, cat, sectionLabelOverrides);

  return (
    <>
      <Header
        user={user}
        onLogin={() => setAuthOpen(true)}
        onLogout={logout}
        query={query}
        setQuery={(q) => replacePatch({ query: q })}
        view={view}
        favCount={favs.length}
        onNewCase={onNewCase}
        onOpenDrawer={() => setDrawerOpen(true)}
        sections={visibleSectionsWithLabels}
      />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        view={view}
        user={user}
        onLogin={() => setAuthOpen(true)}
        onLogout={logout}
        favCount={favs.length}
        onNewCase={onNewCase}
        sections={visibleSectionsWithLabels}
        // The desktop sidebar is hidden at <960px (see
        // `app/styles/layout.css`); the drawer mirrors its category
        // list so mobile users still have filter access.
        categories={sectionCategories}
        activeCat={cat}
        setActiveCat={(c) => {
          if (view.kind === "favs")
            replacePatch({ view: { kind: "section", section: "atlas" }, cat: c });
          else replacePatch({ cat: c });
        }}
        totalCount={scopedCases.length}
      />

      <div className="layout" data-section={view.kind === "section" ? view.section : view.kind}>
        <Sidebar
          activeCat={cat}
          setActiveCat={(c) => {
            if (view.kind === "favs")
              replacePatch({ view: { kind: "section", section: "atlas" }, cat: c });
            else replacePatch({ cat: c });
          }}
          activeTags={tags}
          toggleTag={(t) =>
            replacePatch({ tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] })
          }
          totalCount={scopedCases.length}
          categories={sectionCategories}
          tags={sectionTags}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
        />

        <main className="main" id="main" tabIndex={-1}>
          {/* Per-section error boundaries: a crash in the hero (sparkline,
              count-up, animation observers) doesn't take down the toolbar
              or the grid below. Each boundary logs through lib/log so
              Sentry sees the failure once it's wired. */}
          <ErrorBoundary name="hero">
            <SectionHero view={view} cat={cat} head={head} />
          </ErrorBoundary>
          <Toolbar
            count={filtered.length}
            tags={tags}
            query={query}
            sort={sort}
            onReplace={replacePatch}
          />
          {/* FeaturedRow promotes a hero case at the top of certain
              section landings. Excluded from sections where the
              uniform catalog grid is the primary mental model:
                - Atlas: removed in May-2026 (ADR-0009).
                - Infografías: extended to the same rule per user
                  feedback — the posters are visually heavy on their
                  own, a hero on top broke "every poster the same
                  size" and pushed the grid below the fold.
              ECG and Casos clínicos still use the row because they
              read as editorial / catalog hybrids where a curated
              entry point earns its space. */}
          {view.kind === "section" &&
            view.section !== "atlas" &&
            view.section !== "info" &&
            !cat &&
            tags.length === 0 &&
            !query.trim() && (
              <FeaturedRow cases={scopedCases} favs={favs} onOpen={onCardOpen} onFav={toggleFav} />
            )}
          <ErrorBoundary name="grid">
            <MainGrid
              view={view}
              cat={cat}
              tags={tags}
              query={query}
              isAdmin={isAdmin}
              filtered={filtered}
              allCases={allCases}
              userCases={userCases}
              trashedImports={trashedImports}
              onRestoreImport={adminPipeline.restoreImport}
              onPurgeImport={isAdmin ? adminPipeline.requestPurge : undefined}
              categories={categories}
              categoryCaseCounts={categoryCaseCounts}
              onAddCategory={onAddCategory}
              onRenameCategory={onRenameCategory}
              onRemoveCategory={onRemoveCategory}
              isCustomCategory={isCustomCategory}
              isCategoryHidden={isCategoryHidden}
              onSetCategoryHidden={setCategoryHidden}
              isSectionHidden={isSectionHidden}
              onSetSectionHidden={setSectionHidden}
              getSectionLabel={getSectionLabel}
              onSetSectionLabel={setSectionLabel}
              sectionCaseCounts={sectionCaseCounts}
              currentEmail={user?.email ?? null}
              notify={showToast}
              favs={favs}
              onOpen={onCardOpen}
              onToggleFav={onCardToggleFav}
              onEdit={onEditCase}
              onDelete={adminPipeline.requestDelete}
              onNew={onNewCase}
              onClearFilters={onClearFiltersCb}
              onExploreAtlas={onExploreAtlasCb}
              onPatch={isAdmin ? adminActions.onPatch : undefined}
              onBulkPatch={isAdmin ? adminActions.onBulkPatch : undefined}
              onBulkSoftDelete={isAdmin ? adminActions.onBulkSoftDelete : undefined}
            />
          </ErrorBoundary>
        </main>
      </div>

      <Footer extraCases={userCases.live.length} />

      <ToastHost toast={toast} />

      <AppModals
        openCase={openCase}
        isFav={openCase ? favs.includes(openCase.id) : false}
        onCloseCase={() => replacePatch({ caso: null })}
        onFav={() => openCase && toggleFav(openCase.id)}
        onShare={() => openCase && onShare(openCase)}
        onPresent={() => openCase && replacePatch({ caso: null, presenting: openCase.id })}
        presentingCase={presentingCase}
        // When no filter narrows the catalog we present the full set;
        // otherwise the cinema is scoped to whatever the user was
        // looking at when they hit Present. Same rule as before the
        // modal-mount extraction.
        presentationCases={filtered.length > 0 ? filtered : allCases}
        onClosePresentation={() => replacePatch({ presenting: null })}
        authOpen={authOpen}
        onCloseAuth={() => setAuthOpen(false)}
        onLogin={login}
        formOpen={formOpen}
        editingCase={editingCase}
        currentUser={user}
        categories={categories}
        // Catalog-wide tag vocabulary for the autocomplete in the
        // tags input. Pulled from every case (live + soft-deleted)
        // so re-using a freshly-deprecated tag still suggests it
        // until the admin actually purges. The form unions this with
        // `COMMON_TAGS` and dedupes; we keep that logic co-located
        // there.
        tagSuggestions={Array.from(new Set(allCases.flatMap((c) => c.tags)))}
        onCancelForm={() => {
          setFormOpen(false);
          setEditingCase(null);
        }}
        onSaveCase={onSaveCase}
        adminPipeline={adminPipeline}
        shortcutsOpen={shortcutsOpen}
        onCloseShortcuts={() => setShortcutsOpen(false)}
      />
    </>
  );
}
