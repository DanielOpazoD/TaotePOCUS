"use client";

import { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import SectionHero from "./SectionHero";
import Toolbar from "./Toolbar";
import MainGrid from "./MainGrid";
import ErrorBoundary from "./ErrorBoundary";
import { Header, Footer } from "./chrome";
import { CaseModal, AuthModal } from "./modals";
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
import { useMergedCatalog } from "@/hooks/useMergedCatalog";
import { useAdminPipeline } from "@/hooks/useAdminPipeline";

// Lazy-loaded subtrees: needed only on a specific path or when a modal
// opens. Keeping them out of the initial bundle preserves first-paint
// on the home grid (audit §9). AdminPanel is lazy-loaded inside MainGrid
// so it doesn't appear here.
const CaseForm = dynamic(() => import("./admin/CaseForm"), { ssr: false });
const PresentationMode = dynamic(() => import("./cine/PresentationMode"), { ssr: false });
const ConfirmDialog = dynamic(() => import("./modals/ConfirmDialog"), { ssr: false });
const FeaturedRow = dynamic(() => import("./cards/FeaturedRow"));
const MobileDrawer = dynamic(() => import("./chrome/MobileDrawer"), { ssr: false });
const ShortcutsModal = dynamic(() => import("./modals/ShortcutsModal"), { ssr: false });

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
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState("sidebarCollapsed", false, {
    serialize: (v) => (v ? "1" : "0"),
    deserialize: (raw) => (raw === "1" ? true : raw === "0" ? false : undefined),
  });
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
  const { overrides, setOverride, clearOverride } = useCaseOverrides();

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

  const head = derivePageHead(view, cat);

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
        sections={visibleSections}
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
        sections={visibleSections}
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
              <FeaturedRow
                cases={scopedCases}
                favs={favs}
                onOpen={(c) => pushPatch({ caso: c.id })}
                onFav={toggleFav}
              />
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
              sectionCaseCounts={sectionCaseCounts}
              currentEmail={user?.email ?? null}
              notify={showToast}
              favs={favs}
              onOpen={(c) => pushPatch({ caso: c.id })}
              onToggleFav={(c) => toggleFav(c.id)}
              onEdit={onEditCase}
              onDelete={adminPipeline.requestDelete}
              onNew={onNewCase}
              onClearFilters={() => replacePatch({ cat: null, tags: [], query: "" })}
              onExploreAtlas={() => replacePatch({ view: { kind: "section", section: "atlas" } })}
              onPatch={
                isAdmin
                  ? async (id, patch) => {
                      // Capture the case's current value for every key
                      // the patch is touching BEFORE applying. The undo
                      // toast restores those values via a new patch; if
                      // the case isn't in the merged catalog (rare —
                      // deep link to a soft-deleted case) we skip the
                      // undo affordance rather than offer an inverse
                      // we can't compute.
                      const before = allCases.find((c) => c.id === id);
                      const inverse: Partial<CaseRecord> | null = before
                        ? Object.fromEntries(
                            Object.keys(patch).map((k) => [k, before[k as keyof CaseRecord]]),
                          )
                        : null;
                      const ok = await setOverride(id, patch);
                      if (!ok) return;
                      // Pick the most specific message — the order
                      // matches what an admin clicked. `focus` and
                      // `reviewed` get their own copy so the undo
                      // affordance lands next to a clear nominal cue.
                      let message: string;
                      if (patch.section) message = "Sección actualizada";
                      else if (patch.category) message = "Categoría actualizada";
                      else if ("reviewed" in patch)
                        message = patch.reviewed ? "Marcado revisado" : "Sin marca de revisado";
                      else if ("focus" in patch) message = "Encuadre actualizado";
                      else message = "Caso actualizado";
                      showToast(
                        message,
                        inverse ? { undo: () => setOverride(id, inverse) } : undefined,
                      );
                    }
                  : undefined
              }
              onBulkPatch={
                isAdmin
                  ? async (ids, patch) => {
                      // Capture the previous values per id BEFORE
                      // applying so the unified undo can restore each
                      // card's pre-bulk state. Cards that aren't in
                      // the merged catalog (deep-linked soft-deleted
                      // entries) are skipped from the inverse map —
                      // their forward patch still lands.
                      const inverses: Array<{ id: string; patch: Partial<CaseRecord> }> = [];
                      for (const id of ids) {
                        const before = allCases.find((c) => c.id === id);
                        if (!before) continue;
                        inverses.push({
                          id,
                          patch: Object.fromEntries(
                            Object.keys(patch).map((k) => [k, before[k as keyof CaseRecord]]),
                          ),
                        });
                      }
                      // Fire the forward patches in parallel — they
                      // all hit local state + the same DB row family
                      // and the dual-write mirror tolerates the
                      // out-of-order arrivals at scale.
                      const results = await Promise.all(ids.map((id) => setOverride(id, patch)));
                      const okCount = results.filter(Boolean).length;
                      if (okCount === 0) {
                        showToast("No se pudo aplicar el cambio");
                        return;
                      }
                      let label: string;
                      if (patch.section) label = "Sección";
                      else if (patch.category) label = "Categoría";
                      else if ("reviewed" in patch)
                        label = patch.reviewed ? "Revisado" : "Sin revisar";
                      else label = "Cambio";
                      showToast(
                        `${label}: ${okCount} caso${okCount === 1 ? "" : "s"} actualizado${okCount === 1 ? "" : "s"}`,
                        inverses.length > 0
                          ? {
                              undo: () =>
                                Promise.all(
                                  inverses.map(({ id, patch: inv }) => setOverride(id, inv)),
                                ),
                            }
                          : undefined,
                      );
                    }
                  : undefined
              }
              onBulkSoftDelete={
                isAdmin
                  ? async (ids) => {
                      // Bulk soft-delete: route each id by ownership.
                      // User-owned cases go through `userCases.remove`
                      // (real CRUD) so the trash view picks them up;
                      // seed cases get an override-based deletedAt
                      // tombstone. The undo loops the inverse for each.
                      const userOwned = new Set(userCases.live.map((c) => c.id));
                      const stamp = new Date().toISOString();
                      const targets: Array<{ id: string; kind: "owned" | "seed" }> = ids.map(
                        (id) => ({ id, kind: userOwned.has(id) ? "owned" : "seed" }),
                      );
                      const results = await Promise.all(
                        targets.map(async (t) => {
                          if (t.kind === "owned") {
                            const c = userCases.live.find((x) => x.id === t.id);
                            if (!c) return false;
                            return userCases.remove(c);
                          }
                          return setOverride(t.id, {
                            deletedAt: stamp,
                            deletedBy: user?.email,
                          });
                        }),
                      );
                      const okCount = results.filter(Boolean).length;
                      if (okCount === 0) {
                        showToast("No se pudo mover a papelera");
                        return;
                      }
                      showToast(
                        `${okCount} caso${okCount === 1 ? "" : "s"} movido${okCount === 1 ? "" : "s"} a papelera`,
                        {
                          undo: () =>
                            Promise.all(
                              targets.map((t) => {
                                if (t.kind === "owned") {
                                  const c = userCases.trashed.find((x) => x.id === t.id);
                                  if (!c) return Promise.resolve(false);
                                  return userCases.restore(c);
                                }
                                return setOverride(t.id, {
                                  deletedAt: undefined,
                                  deletedBy: undefined,
                                });
                              }),
                            ),
                        },
                      );
                    }
                  : undefined
              }
            />
          </ErrorBoundary>
        </main>
      </div>

      <Footer extraCases={userCases.live.length} />

      {/* Toast lives here twice on purpose: the visible chip is the
          chrome animation; the sr-only mirror is announced by screen
          readers via aria-live. They share the same message. The
          undo button (if present) is a visual + interactive affordance
          only — screen readers get the announcement on the message
          itself; the inverse action is reachable via Tab. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {toast?.message ?? ""}
      </div>
      {toast && (
        <div className="toast">
          <span className="toast-message">{toast.message}</span>
          {toast.undo && (
            <button type="button" className="toast-undo" onClick={toast.undo}>
              {toast.undoLabel}
            </button>
          )}
        </div>
      )}

      {openCase &&
        (() => {
          // Inter-case navigation (prev/next) was removed in Apr-2026.
          // The IIFE wrapper is kept because the JSX inside still
          // depends on `openCase` being non-null; the body is now
          // straight render with no extra computation.
          return (
            // The modal is the most error-prone subtree (dialog API,
            // focus trap, swipe gesture, scroll listener, kbd shortcuts,
            // CineLoop canvas). If it crashes we close it via the URL
            // patch — better to drop the user back to the grid than
            // to wedge them inside a broken dialog.
            <ErrorBoundary
              name="modal"
              fallback={(error) => (
                <div className="boundary-fallback boundary-fallback--floating" role="alertdialog">
                  <div className="boundary-fallback-inner">
                    <h3>El caso no pudo abrirse</h3>
                    <p>Detalles: {error.message}</p>
                    <button
                      type="button"
                      className="boundary-fallback-retry"
                      onClick={() => replacePatch({ caso: null })}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              )}
            >
              <CaseModal
                caso={openCase}
                onClose={() => replacePatch({ caso: null })}
                isFav={favs.includes(openCase.id)}
                onFav={() => toggleFav(openCase.id)}
                onShare={() => onShare(openCase)}
                onPresent={() => replacePatch({ caso: null, presenting: openCase.id })}
                // Admin-only: edit any case (seed / imported / uploaded).
                // The form is reused; the save path branches on origin.
                onEdit={
                  isAdmin
                    ? () => {
                        setEditingCase(openCase);
                        setFormOpen(true);
                        replacePatch({ caso: null });
                      }
                    : undefined
                }
                // Reset shows only when an override is applied to this id.
                hasOverride={Boolean(overrides[openCase.id])}
                onResetOverride={
                  isAdmin && overrides[openCase.id]
                    ? async () => {
                        const ok = await clearOverride(openCase.id);
                        if (ok) showToast("Edición descartada · contenido original restaurado");
                      }
                    : undefined
                }
                // "Marcar revisado" is editorial bookkeeping: the admin
                // flips it once they've confirmed the case is correctly
                // classified. Persists as a single-field override.
                onToggleReviewed={
                  isAdmin
                    ? async () => {
                        const next = !openCase.reviewed;
                        const ok = await setOverride(openCase.id, { reviewed: next });
                        if (ok) {
                          showToast(next ? "Marcado revisado" : "Sin marca de revisado");
                        }
                      }
                    : undefined
                }
                // Eliminar — admin only. Funnels through useAdminPipeline
                // (same confirm dialog as the classifier and trash table).
                // We close the modal first so the admin sees the
                // confirm dialog cleanly above the layout.
                onDelete={
                  isAdmin
                    ? () => {
                        const target = openCase;
                        replacePatch({ caso: null });
                        adminPipeline.requestDelete(target);
                      }
                    : undefined
                }
                // Permanent-delete from the modal. Admin only. The
                // pipeline closes the modal itself if needed.
                onPurge={isAdmin ? () => adminPipeline.requestPurge(openCase) : undefined}
              />
            </ErrorBoundary>
          );
        })()}
      {presentingCase && (
        <PresentationMode
          cases={filtered.length > 0 ? filtered : allCases}
          startId={presentingCase.id}
          onClose={() => replacePatch({ presenting: null })}
        />
      )}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onLogin={login} />}
      {formOpen && (
        <CaseForm
          initial={editingCase}
          currentUser={user}
          categories={categories}
          // Catalog-wide tag vocabulary for the autocomplete in the
          // tags input. Pulled from every case (live + soft-deleted)
          // so re-using a freshly-deprecated tag still suggests it
          // until the admin actually purges. The form unions this
          // with `COMMON_TAGS` and dedupes; we keep that logic
          // co-located there.
          tagSuggestions={Array.from(new Set(allCases.flatMap((c) => c.tags)))}
          onCancel={() => {
            setFormOpen(false);
            setEditingCase(null);
          }}
          onSave={onSaveCase}
        />
      )}
      <ConfirmDialog
        open={!!adminPipeline.pendingDelete}
        title={
          adminPipeline.pendingDelete ? `¿Eliminar "${adminPipeline.pendingDelete.title}"?` : ""
        }
        message="El caso se mueve a la Papelera y puedes restaurarlo desde el panel admin."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        onConfirm={adminPipeline.confirmDelete}
        onCancel={adminPipeline.cancelDelete}
      />
      <ConfirmDialog
        open={!!adminPipeline.pendingPurge}
        title={
          adminPipeline.pendingPurge
            ? `¿Eliminar permanentemente "${adminPipeline.pendingPurge.title}"?`
            : ""
        }
        message={
          "Esto borra el caso y su archivo de media (imagen / video) de forma definitiva. " +
          "No aparece en la papelera ni se puede restaurar desde la app — la única forma de " +
          "recuperarlo sería importar un backup JSON anterior. ¿Continuar?"
        }
        confirmLabel="Eliminar para siempre"
        cancelLabel="Cancelar"
        destructive
        onConfirm={adminPipeline.confirmPurge}
        onCancel={adminPipeline.cancelPurge}
      />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}
