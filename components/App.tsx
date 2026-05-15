"use client";

import { Suspense, useState } from "react";
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
import { runWithViewTransition } from "@/lib/view-transition";
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
import { useMergedCatalog } from "@/hooks/useMergedCatalog";
import { useAdminPipeline } from "@/hooks/useAdminPipeline";
import { useAdminActions } from "@/hooks/useAdminActions";
import { useCatalogConfig } from "@/hooks/useCatalogConfig";
import { useCatalogDerivations } from "@/hooks/useCatalogDerivations";
import { useCardCallbacks } from "@/hooks/useCardCallbacks";
import { useCaseSaver } from "@/hooks/useCaseSaver";
import { useFocusDefaults } from "@/hooks/useFocusDefaults";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { runStorageMigrations } from "@/lib/storage-migrations";
import { LanguageProvider, useLanguage } from "@/hooks/useLanguage";

// Lazy-loaded subtrees: needed only on a specific path. Keeping them out
// of the initial bundle preserves first-paint on the home grid (audit
// §9). AdminPanel is lazy-loaded inside MainGrid so it doesn't appear
// here. Modal subtrees (CaseForm, PresentationMode, ConfirmDialog,
// ShortcutsModal, PWAStatus, AuthModal) live inside `<AppModals>` so the
// orchestrator's import surface stays lean.
const FeaturedRow = dynamic(() => import("./cards/FeaturedRow"));
const MobileDrawer = dynamic(() => import("./chrome/MobileDrawer"), { ssr: false });

/**
 * Module-level guard so the storage migrations run exactly once per
 * client load, BEFORE any descendant hook reads the affected
 * localStorage keys. A `useEffect` would fire too late — by then
 * `usePersistedState` already hydrated the React state with the
 * legacy shape, and the migration would only land on the next
 * navigation.
 */
let didRunStorageMigrations = false;
function ensureStorageMigrations(): void {
  if (didRunStorageMigrations) return;
  didRunStorageMigrations = true;
  runStorageMigrations();
}

export default function App() {
  // Migrate the persisted catalog shape to the latest schema BEFORE
  // any child component mounts. Idempotent + SSR-safe (the guard
  // inside `runStorageMigrations` short-circuits when `window` is
  // undefined). One-time per page load — see `didRunStorageMigrations`.
  ensureStorageMigrations();

  // `<LanguageProvider>` wraps the entire client tree so any chrome,
  // modal, or panel can read the active language via `useLanguage`.
  // It sits inside the top-level `<Suspense>` boundary because the
  // initial language resolution only requires synchronous reads of
  // URL / localStorage / navigator — no async, no suspending.
  return (
    <Suspense fallback={null}>
      <LanguageProvider>
        <AppInner />
      </LanguageProvider>
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
    page,
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

  // Admin-managed catalog config: custom categories, hidden
  // sections, section label overrides + the toast-wrapped category
  // mutations. The composable bundles three underlying hooks
  // (`useCustomCategories`, `useHiddenSections`, `useSectionLabels`)
  // and the undo-toast surfacing into a single bag — see
  // `hooks/useCatalogConfig.ts`.
  // Active UI language threaded into the catalog config so the
  // override layer (section labels) resolves to the right slot for
  // the visible nav. Reading from `useLanguage` here is safe because
  // `<LanguageProvider>` wraps `<AppInner>` at the top of the tree.
  const { lang } = useLanguage();
  const config = useCatalogConfig({ showToast, lang });
  // Admin-managed thumbnail focus defaults. Lives at the App level so
  // the same blob feeds (a) every `<CaseCard>` for resolution at
  // render and (b) the AdminPanel's editor tab.
  const focusDefaults = useFocusDefaults();

  // Catalog derivation (allCases / trashedImports / categoryCaseCounts).
  // Lives in `useMergedCatalog` so the merge + filter rules have one
  // home and App.tsx isn't directly hosting three side-by-side memos.
  const { allCases, trashedImports, categoryCaseCounts, seedLoading } = useMergedCatalog({
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
    // Pass the merged (built-in + admin custom) category list so a
    // freshly-created custom category ("ocular") shows up in the
    // sidebar as soon as a case is assigned to it. Without this, the
    // hook fell back to the built-in 8 and silently dropped customs.
    categories: config.categories,
  });

  // Derived projections off the merged catalog: filter sectionCategories
  // by visibility, count cases per section, resolve open / presenting
  // cases by id. Lifted into `useCatalogDerivations` so App.tsx isn't
  // hosting four side-by-side useMemos.
  const { sectionCategories, sectionCaseCounts, openCase, presentingCase } = useCatalogDerivations({
    allCases,
    rawSectionCategories,
    isCategoryHidden: config.isCategoryHidden,
    openCaseId,
    presentingId,
  });

  const onShare = (c: CaseRecord) => {
    const url = `${location.origin}${location.pathname}?caso=${c.id}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
    showToast("Enlace copiado");
  };

  // Per-case + bulk admin actions (override + undo toast pipelines).
  // The hook is gated by the caller
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

  // Stable per-card callbacks for the catalog grid + FeaturedRow.
  // SAME function identity per render is the contract that lets
  // `React.memo` on `<CaseCard>` short-circuit re-renders on
  // category clicks (commit 44a624b). See `useCardCallbacks`.
  const { onCardOpen, onCardToggleFav, onClearFiltersCb, onExploreAtlasCb } = useCardCallbacks({
    pushPatch,
    replacePatch,
    toggleFav,
  });

  // Save callback: routes user-uploaded cases to the repo CRUD,
  // seed/imported cases to the override map. Closes + clears the
  // edit state on success via `onAfterSave`.
  const onSaveCase = useCaseSaver({
    userCases,
    setOverride,
    showToast,
    editingCase,
    onAfterSave: () => {
      setFormOpen(false);
      setEditingCase(null);
    },
  });

  // `lang` is already destructured above (threaded into useCatalogConfig).
  const head = derivePageHead(view, cat, config.sectionLabelOverrides, lang);

  return (
    <>
      {/* Each top-level zone gets its own ErrorBoundary so a crash
          in one (the language switcher's outside-click handler, the
          mobile drawer's focus trap, the persistent sidebar) doesn't
          take down the rest of the page. The user can still navigate
          away from a broken zone via the surfaces that survive. */}
      <ErrorBoundary name="header">
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
          sections={config.visibleSectionsWithLabels}
        />
      </ErrorBoundary>
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        view={view}
        user={user}
        onLogin={() => setAuthOpen(true)}
        onLogout={logout}
        favCount={favs.length}
        onNewCase={onNewCase}
        sections={config.visibleSectionsWithLabels}
        // The desktop sidebar is hidden at <960px (see
        // `app/styles/layout.css`); the drawer mirrors its category
        // list so mobile users still have filter access.
        categories={sectionCategories}
        activeCat={cat}
        setActiveCat={(c) => {
          // Same redirect rule as the desktop Sidebar: from any
          // non-section view, picking a category navigates to /atlas.
          if (view.kind !== "section")
            replacePatch({ view: { kind: "section", section: "atlas" }, cat: c });
          else replacePatch({ cat: c });
        }}
        totalCount={scopedCases.length}
      />

      <div className="layout" data-section={view.kind === "section" ? view.section : view.kind}>
        <ErrorBoundary name="sidebar">
          <Sidebar
            activeCat={cat}
            setActiveCat={(c) => {
              // From any non-section view (favs / admin) the sidebar's
              // category click navigates to /atlas with that category
              // applied. Without this, picking "Cardiac" from inside
              // /admin only patched `?cat=...` and stayed on the admin
              // panel — the grid never rendered, looking like a no-op.
              if (view.kind !== "section")
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
        </ErrorBoundary>

        <main className="main" id="main" tabIndex={-1}>
          {/* Per-section error boundaries: a crash in the hero (sparkline,
              count-up, animation observers) doesn't take down the toolbar
              or the grid below. Each boundary logs through lib/log so
              Sentry sees the failure once it's wired. */}
          <ErrorBoundary name="hero">
            <SectionHero view={view} cat={cat} head={head} />
          </ErrorBoundary>
          <ErrorBoundary name="toolbar">
            <Toolbar
              count={filtered.length}
              tags={tags}
              query={query}
              sort={sort}
              onReplace={replacePatch}
              // Full ViewState so the saved-views menu can capture
              // every filter (cat, tags, query, sort, page) under a
              // single named preset. The notify channel is the
              // shared toast surface so "Vista guardada" / "Vista
              // eliminada" lands in the same place as every other
              // admin / public toast.
              viewState={{
                view,
                cat,
                tags,
                query,
                sort,
                caso: openCaseId,
                presenting: presentingId,
                page,
              }}
              notify={showToast}
            />
          </ErrorBoundary>
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
              <ErrorBoundary name="featured">
                <FeaturedRow
                  cases={scopedCases}
                  favs={favs}
                  onOpen={onCardOpen}
                  onFav={toggleFav}
                  openCaseId={openCaseId}
                />
              </ErrorBoundary>
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
              categories={config.categories}
              categoryCaseCounts={categoryCaseCounts}
              onAddCategory={config.onAddCategory}
              onRenameCategory={config.onRenameCategory}
              onRemoveCategory={config.onRemoveCategory}
              isCustomCategory={config.isCustomCategory}
              isCategoryHidden={config.isCategoryHidden}
              onSetCategoryHidden={config.setCategoryHidden}
              isSectionHidden={config.isSectionHidden}
              onSetSectionHidden={config.setSectionHidden}
              getSectionLabel={config.getSectionLabel}
              onSetSectionLabel={config.setSectionLabel}
              sectionLabelOverrides={config.sectionLabelOverrides}
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
              page={page}
              onPageChange={(p) => replacePatch({ page: p })}
              focusDefaults={focusDefaults.defaults}
              onSetFocusGlobal={isAdmin ? focusDefaults.setGlobal : undefined}
              onSetFocusSection={isAdmin ? focusDefaults.setSection : undefined}
              onSetFocusCategory={isAdmin ? focusDefaults.setCategory : undefined}
              onResetFocusDefaults={isAdmin ? focusDefaults.reset : undefined}
              seedLoading={seedLoading}
              openCaseId={openCaseId}
            />
          </ErrorBoundary>
        </main>
      </div>

      <Footer extraCases={userCases.live.length} />

      <ToastHost toast={toast} />

      <AppModals
        openCase={openCase}
        isFav={openCase ? favs.includes(openCase.id) : false}
        // Close is intentionally NOT wrapped in `runWithViewTransition`.
        // The open-side morph (`useCardCallbacks.onCardOpen`) is the
        // visible polish. Wrapping close too introduced flake in CI's
        // headless Chromium where the transition's "wait for next
        // paint" sometimes raced with subsequent modal mounts (notably
        // the auth modal in `e2e/admin.spec.ts`) — Playwright saw
        // `element was detached` mid-action and the page appeared to
        // re-navigate to `/`. Snap-cut close keeps the UX clean and
        // the test suite green.
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
        categories={config.categories}
        // Catalog-wide ES tag vocabulary for the autocomplete in the
        // tags input. Pulled from every case (live + soft-deleted)
        // so re-using a freshly-deprecated tag still suggests it
        // until the admin actually purges. Only the ES slot — the
        // EN editor doesn't surface autocomplete because the EN tag
        // corpus grows organically with translations.
        tagSuggestions={Array.from(new Set(allCases.flatMap((c) => c.tags.es)))}
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
