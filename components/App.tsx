"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import { computeRelaxationSuggestions } from "@/lib/filter-suggestions";
import type { Command as PaletteCommand } from "./modals/CommandPalette";
import type { CaseRecord, View } from "@/lib/types";
import { useViewState } from "@/hooks/useViewState";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useToast } from "@/hooks/useToast";
import { useSession } from "@/hooks/useSession";
import { useFavs } from "@/hooks/useFavs";
import { useUserCases } from "@/hooks/useUserCases";
import { useCaseFilters } from "@/hooks/useCaseFilters";
import { useShortcuts } from "@/hooks/useShortcuts";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useSeenCases } from "@/hooks/useSeenCases";
import { useTagVisibility } from "@/hooks/useTagVisibility";
import { useCaseOverrides } from "@/hooks/useCaseOverrides";
import { useMergedCatalog } from "@/hooks/useMergedCatalog";
import { useAdminPipeline } from "@/hooks/useAdminPipeline";
import { useAdminActions } from "@/hooks/useAdminActions";
import { useCatalogConfig } from "@/hooks/useCatalogConfig";
import { useCatalogDerivations } from "@/hooks/useCatalogDerivations";
import { useCardCallbacks } from "@/hooks/useCardCallbacks";
import { useCaseSaver } from "@/hooks/useCaseSaver";
import { useFocusDefaults } from "@/hooks/useFocusDefaults";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { useOfflineCases } from "@/hooks/useOfflineCases";
import { useAppModalState } from "@/hooks/useAppModalState";
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
const RecentlyViewedRail = dynamic(() => import("./cards/RecentlyViewedRail"));
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
    difficulty,
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
  // Every transient "is this modal open?" flag lives in one
  // bundled hook (PR #122) — used to be six separate `useState`
  // calls inline. Adding a new dialog now means widening one
  // type instead of fishing through 700+ lines of orchestrator.
  const modals = useAppModalState();
  const { favs, toggle: toggleFav } = useFavs(user, hydrated, {
    onAnonymous: () => modals.setAuthOpen(true),
    notify: showToast,
  });
  const userCases = useUserCases(user, hydrated, { notify: showToast });
  // Per-device "vistos" tracker. Auto-marks a case as seen when the
  // user opens its modal (debounced 1 s below to forgive accidental
  // open-close ticks), surfaces a subtle indicator on the card, and
  // powers the toolbar's "Solo no vistos" filter. localStorage-only —
  // seen-state is personal, never shared via URL. `clear` + `isSeen`
  // accessors are not used here yet (the Set is consumed directly via
  // `.has`); they're reserved for a future Settings "borrar historial"
  // row + any callers that prefer the predicate over the Set.
  const { seen: seenCases, markSeen } = useSeenCases();
  // Per-tag visibility overrides. The admin can hide tags from the
  // public surfaces (sidebar cloud, card chip strip, case modal,
  // explorer); the tag stays on each case's tags array but every
  // consumer reads `hiddenSet` and filters. Reversible — the admin
  // sees a "Etiquetas ocultas" section inside the explorer modal
  // with one-click restore per tag. See `useTagVisibility`.
  const tagVisibility = useTagVisibility();
  // Filter toggle for the toolbar's "Solo no vistos" checkbox.
  // Persisted via the same `usePersistedState` pattern as the sidebar
  // collapse so the preference survives a reload. NOT URL-synced for
  // the same reason `seenCases` itself isn't: it's per-device.
  const [unseenOnly, setUnseenOnly] = usePersistedState(STORAGE_KEYS.unseenOnly, false, {
    serialize: (v) => (v ? "1" : "0"),
    deserialize: (raw) => (raw === "1" ? true : raw === "0" ? false : undefined),
  });
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
  useShortcuts({
    onHelp: () => modals.setShortcutsOpen(true),
    onCommandPalette: () => modals.setPaletteOpen(true),
  });

  // Filter persistence between sessions. When the URL comes back
  // clean (no cat / tags / query / sort) and storage has filters
  // for the current section, the hook re-applies them silently via
  // replacePatch. Per-section storage so a "Cardíaco" filter from
  // Atlas doesn't cross-contaminate ECG.
  usePersistedFilters({ view, cat, tags, query, sort, difficulty, replacePatch });

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
  const { lang, setLang, t } = useLanguage();
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
    difficulty,
    // Pass the merged (built-in + admin custom) category list so a
    // freshly-created custom category ("ocular") shows up in the
    // sidebar as soon as a case is assigned to it. Without this, the
    // hook fell back to the built-in 8 and silently dropped customs.
    categories: config.categories,
    // Admin-hidden tags get filtered out of `sectionTags` so the
    // sidebar cloud + tag explorer's "all tags" view both honour
    // the visibility setting. Per-card / per-modal chip strips do
    // their own filter via the same hook (same Set reference, same
    // result).
    hiddenTags: tagVisibility.hiddenSet,
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

  // Apply the per-device "Solo no vistos" filter on top of the base
  // filter pipeline. Kept OUT of `useCaseFilters` because that hook
  // is the URL-state-driven projection (`cat`, `tags`, `query`,
  // `sort`, `difficulty`) — adding a localStorage-backed input
  // there would muddy the contract. As an outer wrapper here, the
  // toggle composes cleanly: identity is preserved when off (no
  // new array), and when on we just `.filter` the same shape.
  const visibleFiltered = useMemo(() => {
    if (!unseenOnly) return filtered;
    return filtered.filter((c) => !seenCases.has(c.id));
  }, [filtered, unseenOnly, seenCases]);

  // Auto-mark the open case as seen 1 s after the modal mounts.
  // The delay gives the user a grace window — opening a card and
  // immediately closing it (misclick, taste check) doesn't count.
  // The effect runs again whenever `openCaseId` changes, so
  // navigating between cases via deep-link / prev-next still
  // accumulates seen marks correctly.
  useEffect(() => {
    if (!openCaseId) return;
    const id = openCaseId;
    const timer = setTimeout(() => markSeen(id), 1000);
    return () => clearTimeout(timer);
  }, [openCaseId, markSeen]);

  // Prev / next navigation within the current filtered set. The
  // "navigable pool" is `visibleFiltered` — i.e. respects every
  // active filter (cat / tags / query / sort / Solo no vistos), so
  // arrowing through the modal feels like reading through "the
  // catalog I see right now" instead of jumping to unrelated cases.
  // When the open case isn't in the pool (e.g., the user opened it
  // by deep-link AND the URL filter excludes it), both flags are
  // false and the chrome hides — no half-functional navigation.
  const caseNav = useMemo(() => {
    if (!openCaseId) return { prevId: null as string | null, nextId: null as string | null };
    const idx = visibleFiltered.findIndex((c) => c.id === openCaseId);
    if (idx < 0) return { prevId: null, nextId: null };
    return {
      prevId: idx > 0 ? (visibleFiltered[idx - 1]?.id ?? null) : null,
      nextId: idx < visibleFiltered.length - 1 ? (visibleFiltered[idx + 1]?.id ?? null) : null,
    };
  }, [openCaseId, visibleFiltered]);

  // Tag explorer payload — a full counted list of tags in the active
  // scope (i.e., the view-scoped case set, NOT the filtered one).
  // Computed lazily-ish here, separate from `sectionTags` because
  // the explorer needs counts (sectionTags is just sorted strings),
  // and because the explorer surfaces ALL tags including the
  // currently-hidden ones (the admin needs visibility into what was
  // hidden so they can restore). Public viewers see only the
  // non-hidden subset; admin gets the full list + the hidden list
  // separately for the restore panel.
  const tagExplorerPayload = useMemo(() => {
    const counts: Record<string, number> = {};
    scopedCases.forEach((c) => {
      // `getCaseTags` is imported lazily here via the localized
      // module to avoid an import in this orchestrator file. Inline
      // a small reader.
      const tagList = c.tags?.[lang] ?? c.tags?.es ?? [];
      tagList.forEach((tg) => {
        counts[tg] = (counts[tg] ?? 0) + 1;
      });
    });
    const visible: { tag: string; count: number }[] = [];
    for (const [tag, count] of Object.entries(counts)) {
      if (tagVisibility.hiddenSet.has(tag)) continue;
      visible.push({ tag, count });
    }
    visible.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    return visible;
  }, [scopedCases, lang, tagVisibility.hiddenSet]);

  // Per-filter relaxation suggestions for the EmptyState chip rail.
  // Computed lazily — we only invoke the pipeline (which iterates
  // through `scopedCases` once per active filter) when the user is
  // actually staring at zero results AND has at least one active
  // filter, so the cost is paid exactly when the suggestion is
  // useful. Empty array otherwise: MainGrid falls back to the
  // existing "Clear all filters" CTA.
  const filterSuggestions = useMemo(() => {
    if (filtered.length > 0) return [];
    const hasActiveFilter =
      cat !== null || tags.length > 0 || query.trim() !== "" || difficulty.length > 0;
    if (!hasActiveFilter) return [];
    return computeRelaxationSuggestions({
      scopedCases,
      cat,
      tags,
      query,
      sort,
      difficulty,
      lang,
    });
  }, [filtered.length, scopedCases, cat, tags, query, sort, difficulty, lang]);

  // Recently-viewed trail. Renders as a horizontal rail above the
  // favorites grid so a reader who hasn't favorited anything yet
  // still has a "continue where I left off" thread. Tracks the case
  // modal open path: every time `openCaseId` changes to a real id,
  // we append the id to the trail. The effect below is the only
  // write site; the hook itself just exposes resolved cases + an
  // add() helper that the effect calls.
  const recentlyViewed = useRecentlyViewed(allCases, openCaseId);
  // Selective-offline state for the medical-use case: marking a
  // case "Guardar offline" caches its video bytes through the SW
  // so the case plays even on a dead hospital wifi. See the hook
  // for the boot-reconcile dance with the SW cache and the LRU
  // eviction toast.
  const offlineCases = useOfflineCases({ cases: allCases, notify: showToast });
  useEffect(() => {
    if (openCaseId) recentlyViewed.add(openCaseId);
    // Intentionally depend only on openCaseId — `recentlyViewed.add`
    // is a stable useCallback identity from the hook, and adding it
    // to the deps would fire the effect on every render of AppInner
    // (which would still be a no-op since dedupe + cap protect us,
    // but cleaner to leave the dep array minimal).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCaseId]);

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

  // useCallback-wrapped because both flow into the command palette's
  // memo deps below. Without stable identity the palette catalog
  // would invalidate on every render, throwing the user's query +
  // selectedIndex.
  const onNewCase = useCallback(() => {
    modals.setEditingCase(null);
    modals.setFormOpen(true);
  }, []);
  const onEditCase = useCallback((c: CaseRecord) => {
    modals.setEditingCase(c);
    modals.setFormOpen(true);
  }, []);

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
    editingCase: modals.editingCase,
    onAfterSave: () => {
      modals.setFormOpen(false);
      modals.setEditingCase(null);
    },
  });

  // `lang` is already destructured above (threaded into useCatalogConfig).
  const head = derivePageHead(view, cat, config.sectionLabelOverrides, lang);

  // Command palette catalog — every action `⌘K` can dispatch.
  // Composed top-down so the most-frequent actions land at the top
  // when the query is empty:
  //   1. Navigate (5-7 items — quick "jump to /ecg")
  //   2. Global actions (toggle theme/lang, new case for admin)
  //   3. Cases (catalog-size — searched by title)
  // Admin-only entries are gated behind `isAdmin` so the public list
  // never leaks an "Editar" option to anonymous visitors.
  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = [];
    // Navigate — top of the list because they're the cheapest hits.
    for (const section of config.visibleSectionsWithLabels) {
      list.push({
        kind: "navigate",
        label: section.label,
        secondary: section.sub,
        run: () => replacePatch({ view: { kind: "section", section: section.id } as View }),
      });
    }
    list.push({
      kind: "navigate",
      label: t("palette.command.favs"),
      secondary: "/favoritos",
      run: () => replacePatch({ view: { kind: "favs" } as View }),
    });
    if (isAdmin) {
      list.push({
        kind: "navigate",
        label: t("palette.command.admin"),
        secondary: "/admin",
        run: () => replacePatch({ view: { kind: "admin" } as View }),
      });
    }
    // Actions — global toggles + admin shortcuts.
    list.push({
      kind: "action",
      label: t("palette.command.toggleTheme"),
      run: () => {
        const next =
          document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        try {
          localStorage.setItem(STORAGE_KEYS.theme, next);
        } catch {
          // localStorage can throw in private mode / quota-exceeded;
          // theme already swapped, persistence is best-effort.
        }
      },
    });
    list.push({
      kind: "action",
      label: t("palette.command.toggleLang"),
      secondary: t(
        lang === "es" ? "palette.command.toggleLang.toEN" : "palette.command.toggleLang.toES",
      ),
      run: () => setLang(lang === "es" ? "en" : "es"),
    });
    if (isAdmin) {
      list.push({
        kind: "action",
        label: t("palette.command.newCase"),
        run: onNewCase,
      });
    }
    // Cases — searchable by title. Two entries per case when admin
    // (open + edit) so editing is one keystroke away. The list is
    // bounded by `MAX_VISIBLE` inside the palette renderer; we don't
    // need to slice here, just hand the full set over.
    for (const c of allCases) {
      const catRecord = config.categories.find((cat) => cat.id === c.category);
      const categoryLabel = catRecord ? catRecord.label.toString() : c.category;
      list.push({ kind: "open-case", caso: c, categoryLabel });
      if (isAdmin) {
        list.push({ kind: "edit-case", caso: c, categoryLabel });
      }
    }
    return list;
  }, [
    config.visibleSectionsWithLabels,
    config.categories,
    isAdmin,
    allCases,
    lang,
    setLang,
    replacePatch,
    onNewCase,
    t,
  ]);

  // Dispatch a palette command. Each `kind` knows what to do — the
  // catalog is just data, the actual side-effects live here so the
  // palette stays presentational and the call sites (onCardOpen,
  // setEditingCase, etc.) remain co-located with the rest of the
  // App's wiring.
  const onRunPaletteCommand = useCallback(
    (cmd: PaletteCommand) => {
      if (cmd.kind === "open-case") {
        onCardOpen(cmd.caso);
      } else if (cmd.kind === "edit-case") {
        onEditCase(cmd.caso);
      } else {
        cmd.run();
      }
    },
    [onCardOpen, onEditCase],
  );

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
          onLogin={() => modals.setAuthOpen(true)}
          onLogout={logout}
          query={query}
          setQuery={(q) => replacePatch({ query: q })}
          view={view}
          favCount={favs.length}
          onNewCase={onNewCase}
          onOpenDrawer={() => modals.setDrawerOpen(true)}
          onOpenSettings={() => modals.setSettingsOpen(true)}
          sections={config.visibleSectionsWithLabels}
        />
      </ErrorBoundary>
      <MobileDrawer
        open={modals.drawerOpen}
        onClose={() => modals.setDrawerOpen(false)}
        view={view}
        user={user}
        onLogin={() => modals.setAuthOpen(true)}
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
            onOpenTagExplorer={() => modals.setTagExplorerOpen(true)}
          />
        </ErrorBoundary>

        <main className="main" id="main" tabIndex={-1}>
          {/* Per-section error boundaries: a crash in the hero (sparkline,
              count-up, animation observers) doesn't take down the toolbar
              or the grid below. Each boundary logs through lib/log so
              Sentry sees the failure once it's wired.

              `.catalog-header` lays out the hero (crumb + h1) on the left
              and the toolbar (saved-views + sort) on the right of the
              SAME ROW. Pre-May-2026 they were two stacked bands separated
              by ~50px of vertical chrome (toolbar's own padding + margin +
              border); inlining them eliminates the standalone toolbar row
              entirely, letting the case grid sit ~40px higher. */}
          <div className="catalog-header">
            <ErrorBoundary name="hero">
              <SectionHero view={view} cat={cat} head={head} />
            </ErrorBoundary>
            <ErrorBoundary name="toolbar">
              <Toolbar
                count={filtered.length}
                tags={tags}
                query={query}
                sort={sort}
                difficulty={difficulty}
                unseenOnly={unseenOnly}
                onToggleUnseenOnly={() => setUnseenOnly((v) => !v)}
                onReplace={replacePatch}
                // Full ViewState so the saved-views menu can capture
                // every filter (cat, tags, query, sort, difficulty,
                // page) under a single named preset. The notify channel
                // is the shared toast surface so "Vista guardada" /
                // "Vista eliminada" lands in the same place as every
                // other admin / public toast.
                viewState={{
                  view,
                  cat,
                  tags,
                  query,
                  sort,
                  difficulty,
                  caso: openCaseId,
                  presenting: presentingId,
                  page,
                }}
                notify={showToast}
              />
            </ErrorBoundary>
          </div>
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
            !query.trim() &&
            difficulty.length === 0 && (
              <ErrorBoundary name="featured">
                <FeaturedRow
                  cases={scopedCases}
                  favs={favs}
                  onOpen={onCardOpen}
                  onFav={toggleFav}
                />
              </ErrorBoundary>
            )}
          {/* Recently-viewed rail on /favoritos only. Renders nothing
              when the trail is empty, so a fresh visitor with no
              history sees the existing layout untouched. Above the
              grid because it reads as "continue where you left off"
              context — the favs grid below is the destination. */}
          {view.kind === "favs" && recentlyViewed.cases.length > 0 && (
            <ErrorBoundary name="recently-viewed">
              <RecentlyViewedRail cases={recentlyViewed.cases} onOpen={onCardOpen} />
            </ErrorBoundary>
          )}
          <ErrorBoundary name="grid">
            <MainGrid
              view={view}
              cat={cat}
              tags={tags}
              query={query}
              isAdmin={isAdmin}
              filtered={visibleFiltered}
              seenIds={seenCases}
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
              suggestions={filterSuggestions}
              // Threading `replacePatch` directly — the suggestion's
              // patch is shaped to be a valid `ViewPatch` so the
              // chip's onClick can apply it without translation.
              onApplySuggestion={replacePatch}
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
            />
          </ErrorBoundary>
        </main>
      </div>

      <Footer extraCases={userCases.live.length} />

      <ToastHost toast={toast} />

      <AppModals
        openCase={openCase}
        isFav={openCase ? favs.includes(openCase.id) : false}
        // Plain state change — no view transition. Both open and
        // close paths run as snap-cut URL updates; the modal's CSS
        // entrance + exit animations (`.modal` scale-in / `dialog`
        // fadeIn / `::backdrop` fade) handle the perceived motion.
        // The original open-path morph (`case-thumb` → `modal-loop`)
        // was removed in PR #79 after four targeted flicker fixes
        // failed to fully eliminate the catalog bleed-through; see
        // `lib/view-transition.ts` header for the full history.
        onCloseCase={() => replacePatch({ caso: null })}
        onFav={() => openCase && toggleFav(openCase.id)}
        onShare={() => openCase && onShare(openCase)}
        onPresent={() => openCase && replacePatch({ caso: null, presenting: openCase.id })}
        // Offline toggle — only renders inside the modal when the
        // case actually has a video to save (the OfflineToggleButton
        // self-gates). The `isOffline` boolean drives the button's
        // pressed state and the badge on the matching grid card.
        isOffline={openCase ? offlineCases.isSaved(openCase.id) : false}
        offlinePending={offlineCases.pending}
        onToggleOffline={() => openCase && offlineCases.toggle(openCase.id)}
        // Tag chip → catalog filter. Closes the modal AND replaces
        // the active tag filter set with just the clicked tag. The
        // single-tag replace (rather than append) mirrors the
        // "explore similar" intent: clicking "B-líneas" inside a
        // case should land on the B-líneas catalog view, not on
        // "everything I was filtering by, plus B-líneas". Users who
        // want to combine tags do so from the sidebar's tag rail
        // (which `toggleTag`s with append semantics) or by
        // re-clicking another tag from the next case modal.
        onSelectTag={(tag) => replacePatch({ caso: null, tags: [tag] })}
        // Prev / next case stepping. The handlers `replacePatch`
        // the `caso` URL param so deep-linking + browser history
        // both stay coherent — using prev / next is identical to
        // closing the modal and opening the neighbor's card.
        onCasePrev={caseNav.prevId ? () => replacePatch({ caso: caseNav.prevId }) : undefined}
        onCaseNext={caseNav.nextId ? () => replacePatch({ caso: caseNav.nextId }) : undefined}
        hasCasePrev={caseNav.prevId !== null}
        hasCaseNext={caseNav.nextId !== null}
        // Tag explorer wiring. Public viewers see only the
        // counted list + click-to-filter; admin gets the per-tag
        // delete + restore handlers (so the explorer renders the
        // trash button next to each row AND the "Etiquetas
        // ocultas" panel at the bottom). Filter clicks reuse the
        // same URL contract as the in-modal tag chips
        // (`onSelectTag` above): close the explorer, replace the
        // tag filter with just the picked tag.
        tagExplorerTags={tagExplorerPayload}
        tagExplorerHidden={isAdmin ? tagVisibility.hiddenList : []}
        tagExplorerActiveTags={tags}
        onSelectTagFromExplorer={(tag) => replacePatch({ tags: [tag] })}
        onHideTagFromExplorer={isAdmin ? (tag) => tagVisibility.setHidden(tag, true) : undefined}
        onRestoreTagFromExplorer={
          isAdmin ? (tag) => tagVisibility.setHidden(tag, false) : undefined
        }
        // Mirror the grid's search highlight inside the modal —
        // when the user deep-linked from a query, the matched
        // substrings in the case title + description get the same
        // `<mark>` treatment so they can spot the hit at a glance.
        searchQuery={query}
        presentingCase={presentingCase}
        // When no filter narrows the catalog we present the full set;
        // otherwise the cinema is scoped to whatever the user was
        // looking at when they hit Present. Same rule as before the
        // modal-mount extraction.
        presentationCases={filtered.length > 0 ? filtered : allCases}
        onClosePresentation={() => replacePatch({ presenting: null })}
        // Bundled transient modal state from `useAppModalState` —
        // replaces 12 individual open/close prop pairs that lived
        // here pre-PR-#123. Close handlers are derived inside
        // AppModals (state flip is local concern); URL-state
        // close handlers (case, presentation) stay as props.
        modals={modals}
        onLogin={login}
        // Offline storage data — the SettingsPanel needs allCases
        // + the savedIds + the remove/purge callbacks. App.tsx
        // owns the offlineCases hook; the panel only renders.
        allCases={allCases}
        savedOfflineIds={offlineCases.savedIds}
        onRemoveOffline={(caseId) => offlineCases.remove(caseId)}
        onPurgeOffline={() => {
          // Drop every locally tracked saved id. The SW purge
          // happens INSIDE the SettingsPanel after this fires so
          // the storage estimate refreshes from a clean slate.
          for (const id of offlineCases.savedIds) offlineCases.remove(id);
        }}
        // CaseForm data dependencies (open state + editingCase
        // live in `modals`).
        currentUser={user}
        categories={config.categories}
        // Catalog-wide ES tag vocabulary for the autocomplete in the
        // tags input. Pulled from every case (live + soft-deleted)
        // so re-using a freshly-deprecated tag still suggests it
        // until the admin actually purges. Only the ES slot — the
        // EN editor doesn't surface autocomplete because the EN tag
        // corpus grows organically with translations.
        tagSuggestions={Array.from(new Set(allCases.flatMap((c) => c.tags.es)))}
        onSaveCase={onSaveCase}
        adminPipeline={adminPipeline}
        paletteCommands={paletteCommands}
        onRunPaletteCommand={onRunPaletteCommand}
      />
    </>
  );
}
